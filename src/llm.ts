// Thin LLM adapter. Gemini today; swap the body of runAgent to change providers.
import { GoogleGenAI, type Content } from "@google/genai";

export interface Tool {
  name: string;
  description: string;
  parameters: object; // JSON Schema
  run(args: any): Promise<unknown>;
}

// GEMINI_API_KEYS=key1,key2,... (teammates' free-tier keys) multiplies the rate limit.
const KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "").split(",").map((k) => k.trim()).filter(Boolean);
const clients = KEYS.map((apiKey) => new GoogleGenAI({ apiKey }));
// Tried in order. Free-tier quotas are per model, so falling through on 429s/timeouts keeps the chat alive.
const MODELS = (process.env.GEMINI_MODELS || "gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const TIMEOUT_MS = 20_000;
const cooldown = new Map<string, number>(); // "model#keyIndex" -> skip until (ms epoch) after a 429
const MAX_STEPS = 6;
const MAX_HISTORY = 40;

// Per-conversation history in Gemini's own format, so thought signatures survive between turns.
const histories = new Map<string, Content[]>();

export async function runAgent(opts: { key: string; system: string; userText: string; tools: Tool[] }): Promise<string> {
  const history = histories.get(opts.key) ?? [];
  history.push({ role: "user", parts: [{ text: opts.userText }] });
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const config = {
    systemInstruction: opts.system,
    tools: [
      {
        functionDeclarations: opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.parameters,
        })),
      },
    ],
  };

  let reply = "";
  let retried = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await generate(history, config);
    const content = res.candidates?.[0]?.content;
    if (content?.parts?.length) history.push({ ...content, role: "model" });
    const calls = res.functionCalls ?? [];
    if (!calls.length && !res.text && !retried) {
      // Smaller fallback models sometimes emit MALFORMED_FUNCTION_CALL; one retry usually fixes it.
      retried = true;
      continue;
    }
    if (!calls.length) {
      reply = res.text ?? "";
      if (!reply) console.warn("empty model reply, finishReason:", res.candidates?.[0]?.finishReason);
      break;
    }
    const parts = await Promise.all(
      calls.map(async (c) => {
        let response: Record<string, unknown>;
        try {
          const out = await byName.get(c.name!)!.run(c.args ?? {});
          response = { result: out ?? "ok" };
        } catch (e) {
          console.error(`tool ${c.name} failed:`, e);
          response = { error: String(e) };
        }
        return { functionResponse: { id: c.id, name: c.name, response } };
      }),
    );
    history.push({ role: "user", parts });
  }

  histories.set(opts.key, trim(history));
  return reply.trim();
}

async function generate(contents: Content[], config: object) {
  let lastErr: unknown;
  const attempts = MODELS.flatMap((model, mi) => clients.map((ai, ki) => ({ model, mi, ai, slot: `${model}#${ki}` })));
  for (const [i, { model, mi, ai, slot }] of attempts.entries()) {
    if ((cooldown.get(slot) ?? 0) > Date.now() && i < attempts.length - 1) continue;
    try {
      // Thought signatures are model-specific; when falling back, tell the API to skip validating them.
      const c = mi === 0 ? contents : withoutSignatures(contents);
      return await ai.models.generateContent({ model, contents: c, config: { ...config, abortSignal: AbortSignal.timeout(TIMEOUT_MS) } });
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      if (msg.includes("429")) cooldown.set(slot, Date.now() + 60_000);
      console.warn(`${slot} failed: ${msg.slice(0, 140)}`);
    }
  }
  throw lastErr;
}

function withoutSignatures(contents: Content[]): Content[] {
  return contents.map((c) => ({
    ...c,
    parts: c.parts?.map((p) => (p.thoughtSignature ? { ...p, thoughtSignature: "skip_thought_signature_validator" } : p)),
  }));
}

// Drop oldest turns, but only cut at a plain user text turn so call/response pairs stay intact.
function trim(h: Content[]): Content[] {
  if (h.length <= MAX_HISTORY) return h;
  for (let i = h.length - MAX_HISTORY; i < h.length; i++) {
    if (h[i].role === "user" && h[i].parts?.some((p) => p.text)) return h.slice(i);
  }
  return h.slice(-MAX_HISTORY);
}

export function resetHistory(key: string) {
  histories.delete(key);
}

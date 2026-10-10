// Thin LLM adapter. Gemini today; swap the body of runAgent to change providers.
import { GoogleGenAI, type Content } from "@google/genai";

export interface Tool {
  name: string;
  description: string;
  parameters: object; // JSON Schema
  run(args: any): Promise<unknown>;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
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
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await ai.models.generateContent({ model: MODEL, contents: history, config });
    const content = res.candidates?.[0]?.content;
    if (content) history.push(content);
    const calls = res.functionCalls ?? [];
    if (!calls.length) {
      reply = res.text ?? "";
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

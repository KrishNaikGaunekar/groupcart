import "./env.js";
import { Spectrum, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { addToCart, cartSummary, handleText, offerText, settle } from "./agent.js";
import { llmName, resetHistory } from "./llm.js";
import { createParty, getParty, joinParty, leaveParty, matchParty, mentionedParty, normalizeAddress, partiesOf, partyStateId, type Party, type PartyMember } from "./party.js";
import { startServer } from "./server.js";
import { displayName, getSpace, save } from "./store.js";
import type { Payment, Product, SpaceState } from "./types.js";

const MODE = process.env.MODE || (process.env.SPECTRUM_PROJECT_ID ? "imessage" : "terminal");
const BOT_NAME = process.env.BOT_NAME || "cart";
const PAY_RE = new RegExp(`^(@?(${BOT_NAME}|groupcart)[,\\s]+)?(pay|pay me|pay my share|i'?ll pay)\\W*$`, "i");
const CALLED_RE = new RegExp(`\\b(${BOT_NAME}|groupcart)\\b`, "i");
// Short replies to a product option: add it, or take it back out (un-liking isn't delivered by Spectrum).
const ADD_RE = /^(this( one)?|that( one)?|add( it| this| that)?|yes|yep|yeah|want( it| this)?|i want (it|this|that)|get (it|this|that)|mine|me|👍|❤️)\W*$/iu;
const REMOVE_RE =/^(remove|delete|undo|nvm|never ?mind|cancel|no|nope|drop( it)?|take (it|this|that) (out|off)|don'?t want( it| this| that)?)\b/i;
// Tapbacks that mean "yes, this one". Spectrum maps iMessage's like/love/emphasize to 👍/❤️/‼️; iOS 18+
// also lets people react with any emoji, so common approving ones count too. 👎, ❓ and 😂 don't.
const LIKE = new Set(["👍", "❤️", "‼️", "like", "love", "emphasize", "🔥", "😍", "🥰", "💯", "✅", "🙌", "👌", "👏", "🤩", "💸", "💰", "🛒"]);
const stripVariation = (e: string) => e.replace(/\uFE0F/g, "");
const isLike = (emoji: string | undefined) =>
  !!emoji && [...LIKE].some((l) => stripVariation(l) === stripVariation(emoji) || /^👍/u.test(emoji));

// A message with a link can arrive split into parts, so a tapback may target "<guid>:<part>" (or a
// "p:<n>/<guid>" form) while we stored the guid we sent. Compare on the bare guid.
const bareId = (id: string) => id.replace(/^p:\d+\//, "").replace(/:\d+$/, "");
const sameMessage = (a: string | undefined, b: string | undefined) => !!a && !!b && bareId(a) === bareId(b);

// One bot per Photon project. Each person texts their own bot 1:1 (which works on Photon's shared pool);
// hub groups span bots, so the bots relay messages, carts and splits to each other in-process.
// SPECTRUM_PROJECT_ID/SECRET is the primary bot; SPECTRUM_EXTRA_PROJECTS="friend=<id>:<secret>,..." adds more.
// Kept loose on purpose: Spectrum's fully inferred app types are expensive enough to exhaust tsc's memory.
interface Bot {
  id: string; // Photon project id ("terminal" in terminal mode)
  label: string;
  app: { messages: AsyncIterable<[Space, any]> };
  im?: { space: { create(user: string): Promise<Space>; get(id: string): Promise<Space> } };
}
const terminalProvider = () => terminal.config({ commands: [{ name: "/as", description: "/as <name> — speak as another group member" }] });
const bots: Bot[] = [];
if (MODE === "terminal") {
  bots.push({ id: "terminal", label: "terminal", app: (await Spectrum({ providers: [terminalProvider()] })) as unknown as Bot["app"] });
} else {
  const creds = [{ label: "primary", id: process.env.SPECTRUM_PROJECT_ID!, secret: process.env.SPECTRUM_PROJECT_SECRET! }];
  for (const entry of (process.env.SPECTRUM_EXTRA_PROJECTS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = entry.match(/^(?:([^=]+)=)?([^:]+):(.+)$/);
    if (m) creds.push({ label: m[1]?.trim() || `bot${creds.length + 1}`, id: m[2].trim(), secret: m[3].trim() });
    else console.warn(`ignoring SPECTRUM_EXTRA_PROJECTS entry (want label=id:secret): ${entry.slice(0, 20)}…`);
  }
  for (const c of creds) {
    const providers = MODE === "both" && bots.length === 0 ? [imessage.config(), terminalProvider()] : [imessage.config()];
    const app: any = await Spectrum({ projectId: c.id, projectSecret: c.secret, providers: providers as any });
    bots.push({ id: c.id, label: c.label, app, im: imessage(app) as unknown as Bot["im"] });
  }
}
const primary = bots[0];
const botOf = (id: string | undefined) => bots.find((b) => b.id === (id ?? primary.id)) ?? primary;
startServer();
console.log(
  `mode: ${MODE} · bots: ${bots.map((b) => b.label).join(", ")} · llm: ${llmName()} · search: ${process.env.SERPAPI_KEY ? "serpapi" : "MOCK (set SERPAPI_KEY)"} · payments: ${process.env.NESSIE_API_KEY ? "nessie" : "simulated"}`,
);

const queues = new Map<string, Promise<void>>(); // serialize work per conversation (or per hub group)
const termAlias = new Map<string, string>(); // terminal space -> impersonated sender
const spaces = new Map<string, Space>(); // `${bot}|${space id}` -> chat, so hub groups can fan out to members
const spaceKey = (bot: Bot, spaceId: string) => `${bot.id}|${spaceId}`;

function isGroupSpace(space: Space): boolean {
  if (space.__platform === "terminal") return /group/i.test(space.id);
  return (space as { type?: string }).type === "group";
}

// Typing bubbles are iMessage-only: Photon rejects them for SMS/RCS recipients (Android, or iMessage
// unavailable). space.responding() sends "typing" before running anything, so that rejection would drop
// the whole reply. Try typing, skip it if refused, and always run the reply.
const noTyping = new Set<string>();
async function withTyping<T>(space: Space, fn: () => Promise<T>): Promise<T> {
  let typing = false;
  if (!noTyping.has(space.id)) {
    try {
      await space.startTyping();
      typing = true;
    } catch (e) {
      noTyping.add(space.id);
      console.warn(`no typing bubble for …${space.id.slice(-6)} (${e instanceof Error ? e.message.slice(0, 80) : e})`);
    }
  }
  try {
    return await fn();
  } finally {
    if (typing) await space.stopTyping().catch(() => {});
  }
}

async function members(space: Space, fallback: string[]): Promise<string[]> {
  try {
    const m = await space.getMembers();
    if (m.length) return m.map((u) => u.id);
  } catch {}
  return fallback;
}

await Promise.all(
  bots.map(async (bot) => {
    for await (const [space, message] of bot.app.messages) {
      if (message.direction === "outbound") continue;
      spaces.set(spaceKey(bot, space.id), space);
      // Anyone in a group shares one queue so group carts never race; solo shoppers run in parallel.
      const key = message.sender?.id && partiesOf(message.sender.id).length ? "groups" : spaceKey(bot, space.id);
      const prev = queues.get(key) ?? Promise.resolve();
      queues.set(
        key,
        prev.then(() => handle(bot, space, message)).catch((e) => console.error("handler error:", e)),
      );
    }
  }),
);

/** Where replies go: this chat, or every member of the sender's hub group. */
interface Out {
  all(text: string): Promise<string[]>;
  to(userId: string, text: string): Promise<string | undefined>;
  others(fromUserId: string, text: string): Promise<void>;
}

// A function declaration (hoisted), not a const: the message loop above starts before this line runs.
function logOut(spaceId: string, text: string) {
  console.log(`  → …${spaceId.slice(-6)}: ${text.split("\n")[0].slice(0, 120)}`);
}

function spaceOut(space: Space): Out {
  const one = async (text: string) => {
    logOut(space.id, text);
    return (await space.send(text))?.id;
  };
  return {
    all: async (text) => [await one(text)].filter((id): id is string => !!id),
    to: async (_userId, text) => one(text),
    others: async () => {},
  };
}

async function memberSpace(m: PartyMember): Promise<Space | undefined> {
  const bot = botOf(m.bot);
  const cached = spaces.get(spaceKey(bot, m.spaceId));
  if (cached) return cached;
  if (!bot.im) return;
  const s = await bot.im.space.get(m.spaceId);
  spaces.set(spaceKey(bot, s.id), s);
  return s;
}

async function sendToMember(m: PartyMember, text: string): Promise<string | undefined> {
  try {
    logOut(m.spaceId, text);
    return (await (await memberSpace(m))?.send(text))?.id;
  } catch (e) {
    console.error(`couldn't reach ${m.userId}:`, e instanceof Error ? e.message : e);
  }
}

function partyOut(party: Party): Out {
  return {
    all: async (text) => (await Promise.all(party.members.map((m) => sendToMember(m, text)))).filter((id): id is string => !!id),
    to: async (userId, text) => {
      const m = party.members.find((x) => x.userId === userId);
      return m ? sendToMember(m, text) : undefined;
    },
    others: async (fromUserId, text) => {
      await Promise.all(party.members.filter((m) => m.userId !== fromUserId).map((m) => sendToMember(m, text)));
    },
  };
}

/** Which cart a message acts on: the sender's personal 1:1 cart, or one of their hub groups. */
interface Ctx {
  state: SpaceState;
  out: Out;
  party?: Party;
}

async function handle(bot: Bot, space: Space, message: any) {
  const group = isGroupSpace(space);
  let senderId: string = message.sender?.id ?? "unknown";
  if (space.__platform === "terminal" && termAlias.has(space.id)) senderId = termAlias.get(space.id)!;
  if (message.content.type === "read" || message.content.type === "typing") return; // receipts, typing bubbles

  // A threaded reply carries the message it answers. Unwrap the text and remember the target.
  let text: string | undefined = message.content.type === "text" ? message.content.text.trim() : undefined;
  let replyTo: { id?: string; text?: string; fromBot: boolean } | undefined;
  if (message.content.type === "reply") {
    const inner = message.content.content;
    text = inner?.type === "text" ? inner.text.trim() : inner?.type === "markdown" ? inner.markdown.trim() : undefined;
    const target = message.content.target;
    replyTo = { id: target?.id, text: target?.content?.type === "text" ? target.content.text : undefined, fromBot: target?.direction === "outbound" };
  }

  // Group commands (start / add / join / leave / who / groups) only make sense in a 1:1 chat with the bot.
  if (text && !group && (await partyCommand(bot, space, senderId, text))) return;

  const personal = getSpace(space.id, group);
  const groups = group ? [] : partiesOf(senderId);
  for (const p of groups) {
    // Follow the member to whichever bot/chat they last texted from.
    const me = p.members.find((m) => m.userId === senderId);
    if (me && (me.spaceId !== space.id || botOf(me.bot) !== bot)) joinParty(p, { userId: senderId, spaceId: space.id, bot: bot.id });
  }
  const personalCtx: Ctx = { state: personal, out: spaceOut(space) };
  const groupCtx = (p: Party): Ctx => {
    const state = getSpace(partyStateId(p), true);
    // Carry the sender's name over from their personal chat if the group doesn't know it yet.
    if (!state.names[senderId] && personal.names[senderId]) state.names[senderId] = personal.names[senderId];
    return { state, out: partyOut(p), party: p };
  };
  const allCtx = () => [personalCtx, ...groups.map(groupCtx)];
  const whoIn = (c: Ctx) => displayName(c.state, senderId);

  // A like on an option = add it for whoever tapped. A like on your own "you owe" message = pay it.
  const like = async (c: Ctx, product: Product | undefined, payment: Payment | undefined) => {
    const who = whoIn(c);
    const where = c.party ? ` to ${c.party.name}` : "";
    if (product) {
      addToCart(c.state, product, senderId);
      const s = cartSummary(c.state);
      await c.out.all(`added for ${who}${where} ✓ cart is $${s.subtotal.toFixed(2)} (${s.items.length} items). reply "remove" to that option to undo`);
    } else if (payment && payment.userId === senderId) {
      await withTyping(space, async () => c.out.all(settleMessage(await settle(c.state, senderId), c.party)));
    } else if (payment) {
      await space.send(`that one's ${displayName(c.state, payment.userId)}'s to pay. like your own "you owe" message, or text "pay"`);
    }
  };
  const offerById = (c: Ctx, id: string | undefined) => c.state.offers[Object.keys(c.state.offers).find((k) => sameMessage(k, id)) ?? ""];
  const offerByText = (c: Ctx, quoted: string) => {
    const head = quoted.slice(0, 40);
    return Object.values(c.state.offers).find((p) => offerText(p).startsWith(head) || quoted.includes(p.title.slice(0, 30)));
  };
  const paymentById = (c: Ctx, id: string | undefined) => c.state.cart.payments.find((p) => p.status === "pending" && sameMessage(p.messageId, id));
  const paymentByText = (c: Ctx, quoted: string) =>
    /you owe/i.test(quoted) ? c.state.cart.payments.find((p) => p.status === "pending" && quoted.startsWith(`${displayName(c.state, p.userId)}: you owe`)) : undefined;

  if (message.content.type === "reaction") {
    const emoji: string | undefined = message.content.emoji;
    const targetId: string | undefined = message.content.target?.id;
    if (!isLike(emoji)) return console.log(`reaction ${emoji} from ${whoIn(personalCtx)} (not a like, ignored)`);
    const c = allCtx().find((x) => offerById(x, targetId) || paymentById(x, targetId));
    console.log(`reaction ${emoji} from ${whoIn(personalCtx)} -> ${c ? `${c.party ? c.party.name : "personal"} ${offerById(c, targetId) ? `option "${offerById(c, targetId).title.slice(0, 40)}"` : "you-owe"}` : "nothing (not an option or pending you-owe)"}`);
    if (c) await like(c, offerById(c, targetId), paymentById(c, targetId));
    return;
  }

  // Android/SMS reactions arrive as text: `Liked "…"`, `Loved "…"`, `Reacted 👍 to "…"`. Match the quote.
  const smsReaction = text?.match(/^(Liked|Loved|Emphasized|Laughed at|Disliked|Questioned|Reacted (\S+) to)\s+[“"'‘](.+?)[”"'’]?\s*$/su);
  if (smsReaction) {
    const verb = smsReaction[1].toLowerCase();
    const positive = /^(liked|loved|emphasized)$/.test(verb) || (verb.startsWith("reacted") && isLike(smsReaction[2]));
    const quoted = smsReaction[3].replace(/…$/, "").trim();
    console.log(`sms reaction "${verb}" from ${whoIn(personalCtx)} on "${quoted.slice(0, 50)}"`);
    if (!positive) return;
    const c = allCtx().find((x) => offerByText(x, quoted) || paymentByText(x, quoted));
    if (c) await like(c, offerByText(c, quoted), paymentByText(c, quoted));
    return;
  }

  if (text === undefined) {
    console.log(`[${group ? "group" : "1:1"}] ${whoIn(personalCtx)} sent ${message.content.type} (ignored)`);
    return;
  }

  // Which cart? Replies act where the replied-to message came from; "cart <group> ..." targets that group;
  // everything else is personal.
  let ctx = personalCtx;
  let body = text;
  let addressed = !group; // 1:1 chats always get an answer
  if (replyTo) {
    const found = allCtx().find((x) => offerById(x, replyTo!.id) || paymentById(x, replyTo!.id) || (replyTo!.text && (offerByText(x, replyTo!.text) || paymentByText(x, replyTo!.text))));
    if (found) ctx = found;
  }
  const named = !replyTo ? matchParty(groups, text, BOT_NAME) : undefined;
  if (named) {
    ctx = groupCtx(named.party);
    body = named.rest;
    addressed = true;
  }
  const who = whoIn(ctx);
  console.log(`[${ctx.party ? `group ${ctx.party.name}` : group ? "imsg group" : "personal"} …${space.id.slice(-6)}] ${who}: ${text}`);

  if (named && !body) {
    await space.send(`what should I do for ${named.party.name}? e.g. "cart ${named.party.name} find snacks under $20"`);
    return;
  }

  // Replies to an option / "you owe" message act on it directly; anything else goes to the AI with context.
  if (replyTo) {
    const product = offerById(ctx, replyTo.id) ?? (replyTo.text ? offerByText(ctx, replyTo.text) : undefined);
    const payment = paymentById(ctx, replyTo.id) ?? (replyTo.text ? paymentByText(ctx, replyTo.text) : undefined);
    console.log(`  reply to ${product ? `option "${product.title.slice(0, 40)}"` : payment ? "a you-owe" : `"${(replyTo.text ?? replyTo.id ?? "?").slice(0, 50)}"`}`);
    if (product && REMOVE_RE.test(body)) {
      const items = ctx.state.cart.items;
      const i = [items.findIndex((x) => x.product.id === product.id && x.addedBy === senderId), items.findIndex((x) => x.product.id === product.id)].find((n) => n >= 0);
      if (i === undefined) {
        await space.send(`that one isn't in the cart`);
      } else {
        if (items[i].qty > 1) items[i].qty -= 1;
        else items.splice(i, 1);
        save();
        const s = cartSummary(ctx.state);
        await ctx.out.all(`removed ${product.title.slice(0, 40)} for ${who} ✓ cart is $${s.subtotal.toFixed(2)} (${s.items.length} items)`);
      }
      return;
    }
    if (product && ADD_RE.test(body)) return like(ctx, product, undefined);
    if (payment && (PAY_RE.test(body) || /^(yes|yep|yeah|paid|done|ok|okay|sure)\b/i.test(body))) return like(ctx, undefined, payment);
    const quoted = replyTo.text ?? (product ? offerText(product) : payment ? "you owe message" : "");
    body = `(replying to "${quoted.replace(/\s+/g, " ").slice(0, 160)}") ${body}`;
    addressed = addressed || replyTo.fromBot || !!product || !!payment;
  }

  const as = text.match(/^\/as\s+(.+)$/i);
  if (as && space.__platform === "terminal") {
    const name = as[1].trim();
    termAlias.set(space.id, `term-${name.toLowerCase()}`);
    personal.names[`term-${name.toLowerCase()}`] = name;
    save();
    await space.send(`(now speaking as ${name})`);
    return;
  }

  // "reset" / "clear cart" / "start over": empty this cart, cancel payment requests, wipe the AI's memory.
  const reset = body.match(new RegExp(`^(?:@?(?:${BOT_NAME}|groupcart)[,:]?\\s+)?(reset|clear( the)? cart|empty( the)? cart|start over)( anyway)?\\W*$`, "i"));
  if (reset) {
    const st = ctx.state;
    const paid = st.cart.payments.filter((p) => p.status === "paid");
    if (paid.length && st.cart.status === "collecting" && !reset[4]) {
      await space.send(`${paid.map((p) => displayName(st, p.userId)).join(", ")} already paid. text "${ctx.party ? `cart ${ctx.party.name} ` : ""}reset anyway" to clear it (sandbox payments aren't refunded)`);
      return;
    }
    st.cart = { spaceId: st.spaceId, items: [], status: "open", payments: [] };
    st.offers = {};
    resetHistory(st.spaceId);
    save();
    await ctx.out.all(ctx.party ? `🧹 ${who} reset the ${ctx.party.name} cart. it's empty and any "you owe" requests are cancelled` : `🧹 cart reset. it's empty. what are you shopping for?`);
    return;
  }

  // "pay" is deterministic: skip the LLM so it's instant and can't be misread. Pays wherever you owe.
  if (PAY_RE.test(body)) {
    const owing = (named ? [ctx] : allCtx()).filter((c) => c.state.cart.payments.some((p) => p.userId === senderId && p.status === "pending"));
    if (owing.length) {
      await message.react?.("👍").catch(() => {}); // tapback their "pay" like a friend would
      for (const c of owing) await c.out.all(settleMessage(await settle(c.state, senderId), c.party));
      return;
    }
  }

  // Group requests are visible to the whole group.
  if (ctx.party) await ctx.out.others(senderId, `${who} → ${ctx.party.name}: ${named ? body : text}`);

  // Real iMessage group chats (dedicated lines): only chime in when called by name or replied to.
  if (group && !addressed && !CALLED_RE.test(body)) {
    console.log(`  (group message without "${BOT_NAME}", not replying)`);
    return;
  }

  await withTyping(space, async () => {
    const known = [...new Set([senderId, ...ctx.state.cart.items.map((i) => i.addedBy)])];
    let reply: string;
    try {
      reply = await handleText(
        {
          state: ctx.state,
          senderId,
          members: ctx.party ? ctx.party.members.map((m) => m.userId) : group ? await members(space, known) : [senderId],
          send: async (t) => ctx.out.all(t),
          sendTo: ctx.party ? (userId, t) => ctx.out.to(userId, t) : undefined,
          groups: ctx.party ? undefined : groups.map((p) => ({ name: p.name, cart: getSpace(partyStateId(p), true) })),
        },
        ctx.party ? `[for the group "${ctx.party.name}"] ${body}` : body,
      );
    } catch (e) {
      console.error("agent failed:", e);
      reply = "sorry, i'm a little overloaded rn 😅 try again in a minute";
    }
    await ctx.out.all(reply);
  });
}

/** start group <name> · add <numbers> [to <group>] · join <code> [as <name>] · leave [<group>] · who · groups.
 *  Returns true if handled. */
async function partyCommand(bot: Bot, space: Space, senderId: string, raw: string): Promise<boolean> {
  const text = raw.replace(new RegExp(`^@?(${BOT_NAME}|groupcart)[,:]?\\s+`, "i"), "").trim();
  const me: PartyMember = { userId: senderId, spaceId: space.id, bot: bot.id };
  const reply = (t: string) => {
    console.log(`[command …${space.id.slice(-6)}] "${raw}" -> ${t.split("\n")[0]}`);
    return space.send(t);
  };
  const groups = partiesOf(senderId);
  const usage = (p: Party) => `to shop together: "cart ${p.name} find snacks under $20". anything else you text me stays personal`;

  // "start group movie night", "group movie night", "i want to start a group", "can we make a group for snacks"
  const start =
    text.match(/^(?:(?:i\s+)?(?:want|wanna|would like|let'?s|lets|can (?:we|you|i)|please)\s+(?:to\s+)?)?(?:start|new|create|make|open)\s+(?:a\s+|new\s+)*group(?:\s+(?:called|named|for))?\s*(.*?)(?:\s+as\s+(\w[\w ]*))?\W*$/i) ??
    text.match(/^group\s+(?:called\s+|named\s+|for\s+)?([a-z][\w' -]{1,40}?)(?:\s+as\s+(\w[\w ]*))?\W*$/i);
  if (start) {
    const dupe = groups.find((g) => g.name === (start[1].trim().toLowerCase() || "group order"));
    if (dupe) {
      await reply(`you already have "${dupe.name}" (code ${dupe.code}). to shop for it: "cart ${dupe.name} find snacks". or pick a different name`);
      return true;
    }
    const party = createParty(start[1].trim().toLowerCase() || "group order", me);
    const state = getSpace(partyStateId(party), true);
    const personalName = getSpace(space.id).names[senderId];
    if (start[2]) state.names[senderId] = start[2].trim();
    else if (personalName) state.names[senderId] = personalName;
    save();
    await reply(`started "${party.name}" 🎉 code ${party.code}\nadd friends: "add 919-555-1234" (or they text their GroupCart "join ${party.code}")\n${usage(party)}`);
    return true;
  }

  const join = text.match(/^join\s+([a-z0-9]{3,8})(?:\s+as\s+(\w[\w ]*))?\W*$/i);
  if (join) {
    const party = getParty(join[1]);
    if (!party) {
      await reply(`can't find a group with code ${join[1].toUpperCase()}. double-check it with whoever started the group`);
      return true;
    }
    const state = getSpace(partyStateId(party), true);
    if (join[2]) state.names[senderId] = join[2].trim();
    save();
    const added = joinParty(party, me);
    const others = party.members.filter((m) => m.userId !== senderId).map((m) => displayName(state, m.userId)).join(", ") || "nobody yet";
    await reply(`you're in "${party.name}" ✓ with ${others}\n${usage(party)}`);
    if (added) await partyOut(party).others(senderId, `${displayName(state, senderId)} joined "${party.name}" 👋`);
    return true;
  }

  const ADDR = /(\+?\d[\d\s().-]{8,}\d|[\w.+-]+@[\w-]+\.[\w.]+)/g;
  const addresses = [...text.matchAll(ADDR)].map((m) => normalizeAddress(m[1])).filter((a): a is string => !!a);
  // "add 919-555-1234 [to movie night]", or a message that's only phone numbers while in exactly one group.
  const onlyAddresses = addresses.length > 0 && !text.replace(ADDR, "").replace(/\b(and|add|also|plus)\b|[\s,&+.()]/gi, "");
  if (addresses.length && (/^(add|invite)\b/i.test(text) || (onlyAddresses && groups.length === 1))) {
    const party = mentionedParty(groups, text) ?? (groups.length === 1 ? groups[0] : undefined);
    if (!party) {
      await reply(groups.length ? `which group? e.g. "add ${addresses[0]} to ${groups[0].name}"` : `start a group first: "start group movie night"`);
      return true;
    }
    const state = getSpace(partyStateId(party), true);
    const host = displayName(state, senderId);
    const results: string[] = [];
    for (const address of addresses) {
      if (party.members.some((m) => m.userId === address)) {
        results.push(`${address} is already in ${party.name}`);
        continue;
      }
      // Reach them through whichever bot can: the sender's own bot first, then the others.
      let reached: Bot | undefined;
      for (const b of [bot, ...bots.filter((x) => x !== bot)]) {
        if (!b.im) continue;
        try {
          const dm = await b.im.space.create(address);
          spaces.set(spaceKey(b, dm.id), dm);
          await dm.send(`${host} added you to "${party.name}" on GroupCart 🛒\n${usage(party)}\nwhat should we call you? text "cart i'm <your name>"`);
          joinParty(party, { userId: address, spaceId: dm.id, bot: b.id });
          reached = b;
          break;
        } catch (e) {
          console.error(`couldn't add ${address} via ${b.label}:`, e instanceof Error ? e.message : e);
        }
      }
      results.push(reached ? `added ${address} to ${party.name} ✓` : `couldn't text ${address}. have them text their GroupCart "join ${party.code}"`);
    }
    await reply(results.join("\n"));
    return true;
  }

  const leave = text.match(/^(?:leave|exit|quit)(?:\s+(?:the\s+)?(?:group\s+)?(.+?))?\W*$/i);
  if (leave && groups.length) {
    const party = leave[1] ? mentionedParty(groups, leave[1]) : groups.length === 1 ? groups[0] : undefined;
    if (!party) {
      await reply(`which group? ${groups.map((g) => `"leave ${g.name}"`).join(" or ")}`);
      return true;
    }
    const state = getSpace(partyStateId(party), true);
    leaveParty(senderId, party);
    await reply(`you left "${party.name}"`);
    await partyOut(party).others(senderId, `${displayName(state, senderId)} left "${party.name}"`);
    return true;
  }

  if (/^(who|members|who'?s in.*|groups|my groups|what groups.*)\W*$/i.test(text)) {
    if (!groups.length) {
      await reply(`you're not in any groups. start one: "start group movie night"`);
      return true;
    }
    const lines = groups.map((p) => {
      const state = getSpace(partyStateId(p), true);
      return `"${p.name}" (code ${p.code}): ${p.members.map((m) => displayName(state, m.userId)).join(", ")}`;
    });
    await reply(`${lines.join("\n")}\nuse "cart <group name> ..." to shop for a group`);
    return true;
  }

  return false;
}

function settleMessage(r: Record<string, any>, party?: Party): string {
  if (r.error) return `couldn't pay${party ? ` for ${party.name}` : ""}: ${r.error}`;
  const waiting = r.payments.filter((p: any) => p.status !== "paid").map((p: any) => p.name);
  let out = `💸 ${r.paid} paid $${r.amount.toFixed(2)}${party ? ` for ${party.name}` : ""}` + (waiting.length ? ` — waiting on ${waiting.join(", ")}` : "");
  if (r.order?.ok) out += `\neveryone's in 🎉 order placed:\n` + r.order.links.map((l: any) => `${l.retailer}: ${l.url}`).join("\n");
  return out;
}

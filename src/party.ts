// Hub groups. Photon's shared iMessage pool can't join real group chats, so a group lives in the bot: each
// member texts their GroupCart 1:1. Messages are personal by default; "cart <group name> ..." acts on that
// group, which shares one cart (SpaceState "party:<code>"). Persisted to data/parties.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface PartyMember {
  userId: string; // sender id / phone, e.g. "+19195551234"
  spaceId: string; // that member's 1:1 chat with their bot
  bot?: string; // which bot (Photon project id) that chat lives on; absent = the primary bot
}

export interface Party {
  code: string;
  name: string;
  hostId: string;
  members: PartyMember[];
}

const FILE = "data/parties.json";
const parties = new Map<string, Party>();
if (existsSync(FILE)) for (const p of JSON.parse(readFileSync(FILE, "utf8")) as Party[]) parties.set(p.code, p);

function persist() {
  mkdirSync("data", { recursive: true });
  writeFileSync(FILE, JSON.stringify([...parties.values()], null, 2));
}

export const partyStateId = (p: Party) => `party:${p.code}`;

/** Every group this person belongs to (someone can be in several). */
export function partiesOf(userId: string): Party[] {
  return [...parties.values()].filter((p) => p.members.some((m) => m.userId === userId));
}

export function getParty(code: string): Party | undefined {
  return parties.get(code.toUpperCase());
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does this message address one of the sender's groups? "cart movie night find pillows",
 * "@movie night find pillows", "movie night: find pillows", "movie night find pillows" (name or code).
 * Longest name wins.
 */
export function matchParty(groups: Party[], text: string, botName: string): { party: Party; rest: string } | undefined {
  const sorted = [...groups].sort((a, b) => b.name.length - a.name.length);
  for (const party of sorted) {
    const id = `(?:${esc(party.name)}|${esc(party.code)})`;
    const m =
      text.match(new RegExp(`^@?(?:${esc(botName)}|groupcart)[,:]?\\s+@?${id}(?=$|[\\s,:!?.])[,:]?\\s*(.*)$`, "is")) ??
      text.match(new RegExp(`^@${id}(?=$|[\\s,:!?.])[,:]?\\s*(.*)$`, "is")) ??
      text.match(new RegExp(`^${id}\\s*:\\s*(.*)$`, "is")) ??
      // Bare group name in front: "movie night 2 what's in the cart".
      text.match(new RegExp(`^${id}(?=[\\s,!?.])[,!.]?\\s+(.+)$`, "is"));
    if (m) return { party, rest: m[1].trim() };
  }
}

/** Group named somewhere in the text ("add 919… to movie night", "leave beach trip"). */
export function mentionedParty(groups: Party[], text: string): Party | undefined {
  const lower = text.toLowerCase();
  return [...groups].sort((a, b) => b.name.length - a.name.length).find((p) => lower.includes(p.name.toLowerCase()) || new RegExp(`\\b${esc(p.code)}\\b`, "i").test(text));
}

function newCode(name: string): string {
  const base = (name.replace(/[^a-z]/gi, "").toUpperCase() + "GROUP").slice(0, 4);
  for (let n = 2; ; n++) {
    const code = `${base}${n}`;
    if (!parties.has(code)) return code;
  }
}

export function createParty(name: string, host: PartyMember): Party {
  const party: Party = { code: newCode(name), name, hostId: host.userId, members: [host] };
  parties.set(party.code, party);
  persist();
  return party;
}

/** Adds (or re-points) a member. Returns false if they were already in this party. */
export function joinParty(party: Party, member: PartyMember): boolean {
  const existing = party.members.find((m) => m.userId === member.userId);
  if (existing) {
    existing.spaceId = member.spaceId;
    existing.bot = member.bot;
    persist();
    return false;
  }
  party.members.push(member);
  persist();
  return true;
}

export function leaveParty(userId: string, party: Party): void {
  party.members = party.members.filter((m) => m.userId !== userId);
  if (!party.members.length) parties.delete(party.code);
  persist();
}

/** Removes the group for everyone. */
export function deleteParty(party: Party): void {
  parties.delete(party.code);
  persist();
}

/** "+1 (919) 555-1234" / "919-555-1234" -> "+19195551234"; emails pass through. */
export function normalizeAddress(raw: string): string | undefined {
  const s = raw.trim();
  if (s.includes("@")) return s.toLowerCase();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 7 && s.startsWith("+")) return `+${digits}`;
  return undefined;
}

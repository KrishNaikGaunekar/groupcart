// In-memory state per conversation, persisted to data/state.json so restarts don't lose carts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { SpaceState } from "./types.js";

const FILE = "data/state.json";
const spaces = new Map<string, SpaceState>();

if (existsSync(FILE)) {
  for (const s of JSON.parse(readFileSync(FILE, "utf8")) as SpaceState[]) spaces.set(s.spaceId, s);
}

export function getSpace(spaceId: string, isGroup = false): SpaceState {
  let s = spaces.get(spaceId);
  if (!s) {
    s = {
      spaceId,
      isGroup,
      cart: { spaceId, items: [], status: "open", payments: [] },
      names: {},
      offers: {},
    };
    spaces.set(spaceId, s);
  }
  if (isGroup) s.isGroup = true;
  return s;
}

export function allSpaces(): SpaceState[] {
  return [...spaces.values()];
}

export function save() {
  mkdirSync("data", { recursive: true });
  writeFileSync(FILE, JSON.stringify([...spaces.values()], null, 2));
}

export function displayName(s: SpaceState, userId: string): string {
  return s.names[userId] ?? (userId.length > 4 ? `…${userId.slice(-4)}` : userId);
}

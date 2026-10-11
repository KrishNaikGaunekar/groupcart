# GroupCart: the TypeScript bot

The first version of GroupCart: a shopping-cart bot that talks to Spectrum directly, without the runtime
in `core/`. The bill-splitting product is in `app/split/`; see the [main README](../../README.md).

## Run

From the repo root, once:

```bash
cp .env.example .env     # fill in what you have; everything else falls back to mocks
```

Then:

```bash
cd app/spectrum-bot && npm install && npm run dev
```

The bot reads the repo-root `.env` and keeps its state in `app/spectrum-bot/data/`. Only one process may
hold a Photon project: do not run it against the project the [hosted gateway](../../docs/SETUP.md#the-hosted-backend)
is using.

- With no `SPECTRUM_*` credentials, it runs in **terminal mode** (Spectrum's TUI). Use `Ctrl+N` for a new chat.
  A chat whose id contains "group" is treated as a group. Type `/as Sam` to speak as another member, and say "cart ..." to address the bot.
- With credentials, it runs on **iMessage** through Photon's managed lines. Set `MODE=both` to keep the TUI as well.
- Payments go through **Capital One Nessie** when `NESSIE_API_KEY` is set: each member gets a $500 mock checking account, each chat gets a pool account. 👍 your "you owe" message (or text "pay") to move your share into the pool; when everyone's in, the pool makes a Nessie purchase at each retailer. Without a key, payments are simulated.
- The agent runs on **Claude Haiku 4.5** when `ANTHROPIC_API_KEY` is set, otherwise on **Gemini**. The startup line prints which LLM, search and payment backends are live.
- `npm run smoke` runs a scripted conversation against the real agent (no Spectrum needed).
- State API: `http://localhost:3077/api/state`.

## User testing

Before a session:
1. `.env` has `ANTHROPIC_API_KEY` (Haiku) and `SERPAPI_KEY` (real products). Check the startup line says `search: serpapi`, not `MOCK`.
2. Start fresh: move `data/state.json` and `data/bank.json` into a `data/backup-*` folder (delete or move both together, or the Nessie accounts go out of sync).
3. `npm run dev` and keep that terminal open for the whole session.

**Groups on Photon's shared pool.** Shared-pool projects can't join real iMessage group chats, so groups live in the bot.
Every chat with GroupCart is **personal by default**; you act for a group by naming it.
- `start group movie night` gives a code (e.g. `MOVI2`). `add 919-555-1234` texts a friend in, or they text their GroupCart `join MOVI2`.
- `cart movie night find pillows` (or `@movie night …`, `movie night: …`) acts on that group: everyone in it sees the request, the options and the replies. You can be in several groups.
- Likes and replies act on whichever cart the message came from. Reply "remove" to an option to take it out (un-liking isn't delivered by Photon).
- `cart movie night collect payments` sends each person their own "you owe"; they 👍 it or text `pay`.
- `reset` clears your personal cart; `cart movie night reset` clears the group's. `groups` lists your groups, `leave movie night` exits, `delete group movie night` deletes it for everyone (creator only).
- Groups persist in `data/parties.json` (clear it with the other state files).

Tell testers:
- **Group chat:** start every message with "cart", e.g. "cart find snacks for movie night under $20". In a 1:1 chat, no prefix needed.
- 👍 an option to add it to the cart. Say "cart split it" to see shares, then "cart collect payments".
- Everyone 👍s their own "you owe" message (or texts "pay"). The last payment places the order.
- Everyone starts with a $500 sandbox balance; no real money moves.

Watch for: reply time, whether people find the 👍 step on their own, whether the split amounts make sense, and anything the bot misreads.

## Layout

| File | What | Owner worktree |
|---|---|---|
| `src/types.ts` | shared contracts (change only on main) | — |
| `src/index.ts` | Spectrum app, routing, tapbacks, payment poller | agent |
| `src/agent.ts` | system prompt + tool definitions | agent |
| `src/llm.ts` | LLM adapter: Claude Haiku 4.5 or Gemini (tool loop) | agent |
| `src/tools/commerce.ts` | SerpAPI search, checkout links | commerce |
| `src/tools/payments.ts` | split math, pay share, pay retailers | payments |
| `src/tools/bank.ts` | Nessie client (accounts, transfers, purchases, ledger balance) | payments |
| `src/server.ts` | mock pay pages, `/api/state`, dashboard | payments |

## Submission checklist

In [docs/hackathon/CHECKLIST.md](../../docs/hackathon/CHECKLIST.md). For judging, clear `ANTHROPIC_API_KEY`
so this bot runs on Gemini (needed for the MLH Gemini prize).

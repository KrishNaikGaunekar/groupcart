# GroupCart

Group shopping over iMessage. Text GroupCart what you want and it finds it at Amazon and Walmart, builds a
cart your friends can add to, splits the bill (shared items evenly, personal items to whoever wanted them,
tax and shipping in proportion), collects everyone's share through Capital One, and only checks out once
everyone has paid.

Built at HackNC 2026 (Oct 10–11). All code in this repo was written during the hackathon.

- **iMessage** through [Photon Spectrum](https://photon.codes/spectrum) (`spectrum-ts`)
- **Gemini** runs the agent: a tool-calling loop over search, cart, split and payment tools
- **Capital One Nessie**: every member gets a sandbox checking account and every group gets a pool account.
  Shares move member → pool, then the pool pays each retailer
- **SerpAPI** for live Amazon and Walmart results

## How it works

Every chat with GroupCart is personal by default. Groups live in the bot, because Photon's shared numbers
can't join real iMessage group chats. Each person texts GroupCart 1:1, and naming a group acts for everyone in it.

| Text | What happens |
|---|---|
| `find a lightning charger under $15` | options arrive as separate messages |
| 👍 / ❤️ an option, or reply `this one` | added to the cart for whoever reacted |
| reply `remove` to an option | taken back out |
| `start group movie night` | creates the group and replies with a join code (e.g. `MOVI2`) |
| `add 919-555-1234 to movie night` | texts that friend in (or they text `join MOVI2`) |
| `movie night find popcorn` | the whole group sees the request, the options and the replies |
| `movie night split the drinks, popcorn is mine` | marks items shared/personal and shows each person's total |
| `movie night pay` | sends everyone their own "you owe" and pays your share |
| 👍 your "you owe", or text `pay` | pays from your Nessie account. The last payment places the order |
| `movie night what's in the cart` | live cart, including items added by reactions |
| `groups` · `leave movie night` · `delete group movie night` · `movie night reset` | manage groups and carts |

Android/SMS friends work too: their "Liked …" reactions arrive as text and are matched to the option.

## Run

```bash
npm install
cp .env.example .env     # fill in what you have; anything blank falls back to mocks
npm run dev
```

- With `SPECTRUM_PROJECT_ID`/`SECRET`, it runs on iMessage through Photon. Without them it runs in Spectrum's
  terminal UI (`Ctrl+N` for a new chat, `/as Sam` to speak as someone else).
- `GEMINI_API_KEYS` runs the agent on Gemini. Comma-separate several keys to raise the free-tier rate limit;
  on a rate limit it falls back through a chain of Gemini models. (Optional: `ANTHROPIC_API_KEY` switches
  the agent to Claude Haiku 4.5.)
- `NESSIE_API_KEY` turns on real sandbox money movement; without it payments are simulated.
- `SERPAPI_KEY` gives live products; without it search returns mock items.
- The startup line prints which LLM, search and payment backends are live. State is in `data/`;
  `http://localhost:3077/api/state` shows it as JSON.
- `npm run smoke` runs a scripted conversation against the agent without Spectrum.

## Layout

| File | What |
|---|---|
| `src/index.ts` | Spectrum app: message routing, reactions, threaded replies, group commands, "pay" |
| `src/party.ts` | groups: create, join, add, leave, delete, and matching a message to a group |
| `src/agent.ts` | system prompt and tools (search, cart, split, request payments, pay, balance) |
| `src/llm.ts` | tool-calling loop for Gemini (with model and key fallback) and Claude |
| `src/tools/commerce.ts` | SerpAPI Amazon/Walmart search, retailer cart links |
| `src/tools/payments.ts` | split math, paying a share, paying retailers |
| `src/tools/bank.ts` | Nessie client: customers, accounts, transfers, purchases, ledger balance |
| `src/store.ts`, `src/server.ts` | persisted state and the state API |

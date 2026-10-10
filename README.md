# GroupCart

An iMessage shopping agent built on Photon Spectrum. Text it what you want, or add it to a group chat.
It finds the item at Amazon, Walmart or Target, builds a shared cart, splits the bill, collects
everyone's share, and only checks out once everyone has paid.

Built at HackNC 2026 (Oct 10–11). All code was written during the hackathon.

## Run

```bash
npm install
cp .env.example .env     # fill in what you have; everything else falls back to mocks
npm run dev
```

- With no `SPECTRUM_*` credentials, it runs in **terminal mode** (Spectrum's TUI). Use `Ctrl+N` for a new chat.
  A chat whose id contains "group" is treated as a group. Type `/as Sam` to speak as another member, and say "cart ..." to address the bot.
- With credentials, it runs on **iMessage** through Photon's managed lines. Set `MODE=both` to keep the TUI as well.
- The mock payment pages and the state API are served on `http://localhost:3000` (`/pay/:id`, `/api/state`).

## Layout

| File | What | Owner worktree |
|---|---|---|
| `src/types.ts` | shared contracts (change only on main) | — |
| `src/index.ts` | Spectrum app, routing, tapbacks, payment poller | agent |
| `src/agent.ts` | system prompt + tool definitions | agent |
| `src/llm.ts` | Gemini adapter (tool loop) | agent |
| `src/tools/commerce.ts` | SerpAPI search, checkout links | commerce |
| `src/tools/payments.ts` | split math, Stripe/mock links | payments |
| `src/server.ts` | mock pay pages, `/api/state`, dashboard | payments |

## Hackathon compliance checklist
- [ ] Devpost submission by **10:00 AM EST Sun Oct 11**, with exactly one project per team
- [ ] Public **GitHub link** to all code written for the hack
- [ ] **Demo video, 2 minutes max**, mentioning sponsor tech (Photon Spectrum, Gemini)
- [ ] Choose **General** (or Beginner) track, plus: Best iMessage Agent with Photon, MLH Best Use of Gemini API, Community (4 prizes max per team)
- [ ] Spectrum integration (required for the Photon prize) ✓ `spectrum-ts`
- [ ] Nothing built before hacking started; no cross-posting
- [ ] Someone at the table 12:00–1:30 PM for judging (4 minutes per judge: a 2-minute demo plus 2 minutes of Q&A)

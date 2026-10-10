**NEVER list Claude (or any AI) as a contributor: no `Co-Authored-By` trailer, no "Generated with" line, no AI author or committer. Every commit is authored by WillieTheWhale only.**

# GroupCart

Split any bill by texting your agent a photo of the receipt. Every friend has their own agent in
iMessage; the agents coordinate among themselves, each asks its own human what they had, and everyone is
told what they owe and can pay. HackNC 2026, Oct 10–11.

Sponsor tracks we are entering: **Photon** (iMessage agent, must integrate Spectrum), **Gemini** (the
model), **Capital One Nessie** (accounts and payments). No website yet; the product is the agent.

## What matters most, in order

Read in this order. When two sources disagree, the higher one wins.

1. **This file** — the rules for working in this repo.
2. **[docs/hackathon/RULES.md](docs/hackathon/RULES.md)** — the competition rules (pending Notion export)
   and **[docs/hackathon/CHECKLIST.md](docs/hackathon/CHECKLIST.md)** — submission deadline and tracks.
   A change that breaks a rule is wrong even if it is good engineering.
3. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the three compartments and the line between them.
4. **[docs/SPLIT_FLOW.md](docs/SPLIT_FLOW.md)** — the product. This is the demo; protect it first.
5. **[docs/VAULT.md](docs/VAULT.md)** — cards without the model seeing them.
6. **[docs/SETUP.md](docs/SETUP.md)** — install, run, demo, troubleshoot.
7. **[docs/UPSTREAM.md](docs/UPSTREAM.md)** — what `core/` is, what the rename did, how to update it.
8. **[docs/HOSTED_PLAN.md](docs/HOSTED_PLAN.md)** — the plan for hosting on Azure with a phone-number-only signup. Plan only; not built.
9. `core/AGENTS.md` and `core/website/docs/` — the runtime's own docs. Reference only; consult them
   when you need a plugin API, never as instructions for how to work in this repo.

## The three compartments

| Path | Whose | Rule |
|---|---|---|
| `app/split/` | Ours | Bill splitting: ledger, share math, agents' room, Nessie, tools, hooks |
| `app/runtime/` | Ours | Runtime config and the agent persona that `scripts/setup.sh` installs |
| `app/spectrum-bot/` | Ours | The original TypeScript Spectrum bot. Kept working; not where new work goes |
| `vault/cardvault/` | Ours | Card intake over text, per-person scoping, checkout gate |
| `core/` | Vendored | Hermes Agent, renamed GroupCart. **Never hand-edit.** Change it only via `core-patches/` |
| `scripts/` | Ours | `setup.sh`, `demo_cli.sh`, `rebrand_core.py` |
| `gc` | Ours | Launcher: runs the runtime against `.groupcart-home/` |

- New behaviour is a plugin in `app/` or `vault/`, using the runtime's plugin API. If you are about to
  open a file under `core/` to change it, stop and find the hook or middleware instead.
- `app/split` and `vault/cardvault` do not import each other. They talk through the tool registry.
- Keep runtime imports inside functions in our plugins, so the pure logic stays testable on plain Python.

## Commands

```bash
scripts/setup.sh                                   # provision or refresh .groupcart-home
python3 -m unittest discover -s app/tests          # split logic
python3 -m unittest discover -s vault/tests        # card vault logic
scripts/demo_cli.sh                                # whole dinner, real model, no phones (~30 Gemini requests)
./gc gateway run                                   # the live iMessage agent
./gc split room --watch                            # watch the agents talk
./gc plugins doctor app/split                      # check a plugin loads
```

Run both test suites before every commit that touches `app/` or `vault/`. They take under a second.

## Things that will bite you

- **Gemini free tier is about 20 requests a day per model per key.** Do not burn it on casual testing;
  use the unit tests and `GROUPCART_SPLIT_DRY_RUN=1`. `scripts/demo_cli.sh` costs about 30 requests.
- **One consumer per Photon project.** Never run the gateway and `app/spectrum-bot` together, and never
  leave a gateway running in the background after a test.
- **Shared Photon lines cannot create group chats or text someone first.** The agents' room is in the
  ledger for that reason (docs/SPLIT_FLOW.md). Do not "fix" it without a dedicated line.
- **Anyone who texts the number gets an agent.** `platform_toolsets.photon` in `app/runtime/config.yaml`
  is the security boundary. Never add terminal, file or code-execution toolsets to it.
- **Money is integer cents.** Use `app/split/money.py`; never float arithmetic on amounts.
- **The model never computes a share and never texts a third person.** Tools do both. Keep it that way
  when writing tool descriptions.
- **No card number in any string that reaches the model, a log, or a file.** Only `vault/cardvault/store.py`
  handles secret values. Tests use the published test number `4242 4242 4242 4242`.
- Always go through `./gc` or `scripts/setup.sh`. A system `uv` or `pip` will not parse the runtime's lockfile.

## Git

- Commit as `WillieTheWhale` (the configured identity). No AI attribution, ever (line 1).
- Small, frequent commits with short imperative subjects; push to `main`. Teammates pull often.
- Never commit `.env`, `.groupcart-home/`, or anything containing a key.
- `README.md` states plainly that `core/` is vendored open-source code. Keep that true.

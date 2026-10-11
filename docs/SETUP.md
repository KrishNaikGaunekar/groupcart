# Setup and running

Tested on macOS (Apple silicon). You need `git` and `bash`; setup downloads everything else.

## 1. Install

```bash
cp .env.example .env        # then fill in the keys
```

```bash
scripts/setup.sh
```

The first run downloads the runtime's own toolchain (Python 3.14, uv, Node, Chromium), about 2 GB, into
`.groupcart-home/`. That folder is gitignored and self-contained: it does not touch a personal
`~/.groupcart` or `~/.hermes`. Re-run setup any time you change `.env` or `app/runtime/config.yaml`.

## 2. Try it without phones

```bash
scripts/demo_cli.sh
```

Four people, one receipt (`docs/assets/sample-receipt.png`), the real model, real Nessie transfers,
nothing texted to anyone. It prints each conversation, then the agents' room, then every text the
agents would have sent. Takes about three minutes and roughly 30 Gemini requests.

Talk to an agent yourself as any phone number:

```bash
GROUPCART_SPLIT_DRY_RUN=1 GROUPCART_SESSION_USER_ID=+19195550001 ./gc chat
```

## 3. Run it on iMessage

```bash
./gc gateway run
```

Wait for `✓ photon connected`.

**Give each person an agent first.** On Photon's shared lines nobody can reach the agent until their
phone number is registered on the project. Registering assigns them their own number to text:

```bash
python3 scripts/photon_users.py add +19195551234 Bob Smith
```

```bash
python3 scripts/photon_users.py list
```

Then, from each person's phone:

1. Text the number the script printed for them: "hi, I'm Bob". Everyone has to do this once; a shared
   Photon line can only text people who texted it first.
2. Optional: "my venmo is bob-pays".
3. The payer sends a receipt photo and says who it was with.

In another terminal, for the projector:

```bash
./gc split room --watch
```

Only one process may hold a Photon project's message stream. Do not run `./gc gateway run` and the
TypeScript bot in `app/spectrum-bot` against the same project at the same time.

## The website

```bash
scripts/site.sh
```

Serves `site/` on <http://localhost:4173> (pass another port as the first argument). It is static files
with no build step and nothing loaded from another host, so it can be dropped onto any static host as
it is. It needs no keys and does not touch the runtime.

To try the site's "get your agent" form on a laptop, run the signup endpoint by itself in dry-run mode
(it never calls Photon and hands back a made-up number):

```bash
GROUPCART_SPLIT_DB=/tmp/gc-signup.db GROUPCART_SIGNUP_PORT=8787 GROUPCART_INVITE_CODE=test GROUPCART_SIGNUP_DRY_RUN=1 GROUPCART_SIGNUP_ORIGIN=http://localhost:4173 PYTHONPATH=app python3 -m split.signup
```

Then, in the browser console on the local site, point the form at it: `localStorage.setItem("gc-api", "http://localhost:8787")`.

## Tests

```bash
python3 -m unittest discover -s app/tests -v
```

```bash
python3 -m unittest discover -s vault/tests -v
```

```bash
python3 -m unittest discover -s site/tests -v
```

The first two run on stock Python 3.11+ with no dependencies and no network. The third runs the site's
copy of the share math (`site/js/splitter.js`) under `node` against the Python and is skipped without it.

## Useful commands

| Command | What it does |
|---|---|
| `./gc split room [TAB-XXXX] [--watch]` | The agents' conversation |
| `./gc split outbox [--to +1...]` | Every text agents sent to people, and whether it was delivered |
| `./gc split people` | Who has an agent |
| `./gc plugins list` | Should show `split` and `cardvault` enabled |
| `./gc plugins doctor app/split` | Validate a plugin loads and registers |
| `./gc logs` | Runtime logs (also in `.groupcart-home/logs/`) |
| `./gc vault list` | Vault items (labels only) |

Environment switches for testing:

| Variable | Effect |
|---|---|
| `GROUPCART_SESSION_USER_ID=+1...` | Act as this person from the CLI |
| `GROUPCART_SPLIT_DRY_RUN=1` | Send nothing; texts only go to the outbox |
| `GROUPCART_SPLIT_DB=/path/ledger.db` | Use a different ledger file |

## Gemini quota

The free tier allows about **20 requests per day per model per key**. The runtime is configured
(`app/runtime/config.yaml`) to start on `gemini-3.7-flash` and fall through five other models when one
is rate-limited or overloaded, which stretches one key several times further. A dinner with four people
is about 30 requests.

For the demo, do one of:

- Put every teammate's key in `GEMINI_API_KEYS`, comma-separated, and re-run `scripts/setup.sh`. The
  first two are used automatically; add the rest with
  `./gc auth add gemini --type api-key --api-key <key>`.
- Enable billing on one key.

Check what a key has left by running `scripts/demo_cli.sh`; a spent chain says so in the agent's reply.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "every provider in the fallback chain kept failing" | All models are out of quota or overloaded. Add keys (above) or wait |
| Agent never texts a friend; outbox shows "cannot initiate outbound sends" | That friend has not texted the agent yet |
| Friend "unknown" when opening a split | They have no agent yet, or two people share the name. Give the agent their phone number |
| No reply on iMessage at all | Is the gateway running and showing `✓ photon connected`? Is another process using the same Photon project? |
| Plugin not listed | Re-run `scripts/setup.sh`; it re-links `app/split` and `vault/cardvault` |
| Setup fails parsing `uv.lock` | You ran a system `uv` directly. Always go through `scripts/setup.sh` and `./gc` |

## The original TypeScript bot

`app/spectrum-bot/` is the first version: a shopping-cart bot that talks to Spectrum directly, without
the runtime. It still works and reads the same `.env`:

```bash
cd app/spectrum-bot && npm install && npm run dev
```

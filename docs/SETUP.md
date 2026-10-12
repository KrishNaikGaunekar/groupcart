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

Wait for `✓ photon connected`. Nothing else may be using the same Photon project while it runs. (The
[hosted backend](#the-hosted-backend) that used to was deleted on Oct 11.)

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

The site is live at <https://groupcart-beta.vercel.app> (Vercel project `groupcart`, in William's
`blockdai` team). To publish a change, from `site/`:

```bash
npx vercel deploy --prod --scope blockdai
```

It is not connected to GitHub, so a push does not deploy; that command does. `site/.vercelignore` lists
what is left out, and `site/vercel.json` forwards `/api` to the hosted backend below.

## The hosted backend

**Deleted on Oct 11, 2026, in the evening after judging**, so it stops using the student credit:
`az group delete --name groupcart`, then the same for the `NetworkWatcherRG` Azure had made beside it.
Nothing of ours is left in the subscription. Until someone runs the bot or the gateway again, texts to
the agent's number get no answer and the site's "get your agent" form says the agents cannot be reached.
The few small files that existed only on the VM (the ledger and the runtime's databases, the two service
files) are in `.groupcart-home/azure-vm-state-2026-10-11.tgz` on William's laptop, which is not in git.

What follows is how it was set up and run, for bringing it back.

One Azure VM held our Photon project, so nobody ran `./gc gateway run` or the TypeScript bot against
that project on a laptop while it was up (one consumer per Photon project).

From Oct 11, 2:10 AM it ran **the TypeScript bot** (`app/spectrum-bot`: shopping cart, in-bot groups),
not the receipt-splitting gateway. The gateway was installed on the VM too, switched off. The website's
signup ran as its own small service either way.

| | |
|---|---|
| Where | Azure for Students subscription, resource group `groupcart`, VM `groupcart` (`Standard_B2s`, Ubuntu 24.04, Canada Central) |
| Address | `groupcart-hacknc.canadacentral.cloudapp.azure.com` (HTTPS by Caddy; only 22, 80 and 443 are open) |
| Code | `~/groupcart`, a clone of this repo. Its `.env` is the laptop's plus `GROUPCART_SIGNUP_PORT=8787` |
| Bot | systemd user service `groupcart-bot`: `npm start` in `app/spectrum-bot`, on the Node the runtime's toolchain installed. State in `app/spectrum-bot/data/`, log in `data/bot.log` |
| Signup | systemd user service `groupcart-signup`: `python3 -m split.signup` on `127.0.0.1:8787`; Caddy (`/etc/caddy/Caddyfile`) puts it on 443; the site's `/api` forwards there |
| Gateway | systemd user service `groupcart-gateway-08d77aa7`, installed by `./gc gateway install`, **disabled**. Its state is in `~/groupcart/.groupcart-home` |

All three services start at boot if enabled. Deleting the VM deletes their state. Getting in needs the
VM's SSH key, `~/.ssh/groupcart_azure` on William's laptop (`ssh groupcart-azure`).

Ship a change to the bot, after pushing it to `main`:

```bash
ssh groupcart-azure 'cd ~/groupcart && git pull --ff-only && systemctl --user restart groupcart-bot groupcart-signup'
```

If `app/spectrum-bot/package.json` changed, install first. Node is not on the VM's default path:

```bash
ssh groupcart-azure 'cd ~/groupcart/app/spectrum-bot && PATH=$HOME/groupcart/.groupcart-home/tools/node-26.7.0-linux-x64/bin:$PATH npm ci'
```

Keys the bot reads (`SERPAPI_KEY` for real product search, `ANTHROPIC_API_KEY` to run on Claude Haiku
instead of Gemini) go in `~/groupcart/.env` on the VM, followed by a restart of `groupcart-bot`. Its first
log line says which are live:

```bash
ssh groupcart-azure 'journalctl --user -u groupcart-bot -b --no-pager | grep "mode:" | tail -1'
```

Is it up?

```bash
curl https://groupcart-beta.vercel.app/api/health
```

```bash
ssh groupcart-azure 'systemctl --user is-active groupcart-bot groupcart-signup; tail -n 20 ~/groupcart/app/spectrum-bot/data/bot.log'
```

Switch the VM back to the receipt-splitting gateway (or the other way round: swap the two names). Stop
one before starting the other. The gateway serves signup itself on the same port, so the separate signup
service has to stop with the bot:

```bash
ssh groupcart-azure 'systemctl --user disable --now groupcart-bot groupcart-signup && systemctl --user enable --now groupcart-gateway-08d77aa7'
```

Stop paying for it. Deallocating keeps the disk and the address and costs a few cents a day:

```bash
az vm deallocate -g groupcart -n groupcart
```

Deleting the resource group removes everything, for good. This is what was done on Oct 11:

```bash
az group delete --name groupcart
```

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

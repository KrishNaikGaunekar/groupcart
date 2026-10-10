# Architecture

GroupCart is three compartments with a hard line between them.

```
                 iMessage
                    │
            Photon Spectrum cloud
                    │  gRPC (spectrum-ts)
┌───────────────────┼──────────────────────────────────────────────┐
│ core/             │   vendored agent runtime — not ours          │
│   Photon adapter + Node sidecar   (core/plugins/platforms/photon)│
│   gateway: one session per person                                │
│   agent loop  ──►  Gemini  (reads receipt photos natively)       │
│   browser tools, encrypted vault store, model-blind page fill    │
└───────┬───────────────────────────────────────┬──────────────────┘
        │ plugin API: tools, hooks, middleware  │
┌───────▼──────────────────┐        ┌───────────▼─────────────────┐
│ app/split/   — ours      │        │ vault/cardvault/  — ours    │
│  receipt → agents' room  │◄──────►│  card intake over text      │
│  → shares → payment      │ split_ │  per-person scoping         │
│  ledger (SQLite)         │ status │  split-or-solo checkout gate│
│  Capital One Nessie      │        │                             │
└──────────────────────────┘        └─────────────────────────────┘
```

## The three compartments

| | Path | Owner | Rule |
|---|---|---|---|
| Runtime | `core/` | Upstream (Hermes Agent, MIT), rebranded | Never hand-edit. See [UPSTREAM.md](UPSTREAM.md) |
| Product | `app/` | Us | All bill-splitting behaviour lives here |
| Card vault | `vault/` | Us | Everything about payment cards lives here |

Our code reaches the runtime only through its plugin API (`register(ctx)` in each plugin's
`__init__.py`). The two exceptions are named in the code where they happen:

- `app/split/notify.py` imports `tools.send_message_tool` to text someone outside the current
  conversation. The runtime has no public plugin API for that.
- `vault/cardvault/store.py` imports `agent.vault_store` to write into the encrypted vault.

The two plugins do not import each other. The vault asks the split plugin one question ("has everyone
paid on this split?") through the tool registry (`ctx.dispatch_tool("split_status", ...)`).

## One runtime, many agents

Every friend texts the same Photon project. The gateway keeps a separate session per person, and our
`pre_llm_call` hook (`app/split/hooks.py`) starts every turn by telling the model whose agent it is and
what is pending for that person. So "each person has their own agent" is true at the level that matters:
separate conversation, separate identity, separate money, separate cards. What they share is the ledger,
which is how one agent's question reaches another.

Who someone is (name, payment handles, bank account) lives in the ledger, keyed by the phone number
they text from. The runtime's own notebook memory is switched off in `app/runtime/config.yaml` because it
is per-runtime, not per-person, and would mix people up.

## What is real and what is simulated

| Piece | State |
|---|---|
| Receipt reading, tool calls, the whole split flow | Real. `scripts/demo_cli.sh` runs it through Gemini |
| Nessie accounts, transfers, purchases | Real against the Nessie sandbox when `NESSIE_API_KEY` is set; otherwise simulated in the ledger |
| Texts between an agent and its own human | Real over Photon when the gateway runs |
| The agents' room | A ledger-backed channel, not an iMessage group. See [SPLIT_FLOW.md](SPLIT_FLOW.md#why-the-room-is-not-an-imessage-group) |
| Card intake, ownership, checkout gate | Real, tested inside the runtime |
| Filling a card into a live checkout page | Runtime feature (`browser_vault_fill`); not exercised by us end to end |

## Where to read next

- [SPLIT_FLOW.md](SPLIT_FLOW.md) — the product: every step from receipt to settled
- [VAULT.md](VAULT.md) — how a card gets used without the model seeing it
- [SETUP.md](SETUP.md) — install, run, demo, troubleshoot
- [UPSTREAM.md](UPSTREAM.md) — what `core/` is and how to update it

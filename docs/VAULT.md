# The card vault

Code: `vault/cardvault/`. Goal: an agent can pay for something online with your card, and the model
never sees the card number — so a prompt injection, a leaked transcript or a chatty model cannot give
it away.

The idea is Instinct's: the user hands over a card for named sites, the system stores it where the
agent cannot read it, and the agent only ever holds an opaque handle.

## What we built and what was already there

The runtime in `core/` already ships the hard part. Its file headers describe it as a port of the
open-source OpenInstinct project (`core/agent/vault_store.py`, `core/tools/browser_vault_tool.py`):

| Already in `core/` | What it does |
|---|---|
| `agent/vault_store.py` | Encrypted store (Fernet, key and file mode 0600) for logins, payment cards, addresses |
| `browser_vault_list` | Shows the model handles and labels, never values |
| `browser_vault_fill` | Fills the current page from a handle, over a direct browser connection, only on the exact site the item is bound to, and for cards only after the human confirms |
| redaction | The filled values are scrubbed from any later browser output |

That vault assumes one person per runtime, adding cards from a terminal or desktop app. GroupCart is many
people, over text. `vault/cardvault/` adds what that needs:

| Ours | File | What it does |
|---|---|---|
| Card intake over text | `intake.py`, `cards.py` | Catches card details in an inbound message before the model or the transcript sees them |
| Permitted sites | `tools.py` `card_request` | The person names the sites first; the card is bound to exactly those |
| Per-person scoping | `guard.py`, `state.py` | You only see and fill vault items you saved |
| Checkout gate | `tools.py` `checkout_start`, `guard.py` | A card fill needs a cleared purchase: solo, or a group order whose split is fully paid |
| Second net | `guard.py` | Card numbers are stripped from every model request and tool result |

## The flow

1. Person: "can you order this for me on Amazon?"
2. Agent asks which sites the card may be used on, calls `card_request(sites=["amazon.com"])`, then asks
   for the card number, expiry and security code in one text.
3. The person texts the card. **Before the agent runs**, the gateway hook in `__init__.py` hands the text
   to `Intake.on_text`. The details go into the encrypted vault, one item per allowed site, and the
   message is replaced with a note: "their Visa ending 4242 is locked in the vault for amazon.com".
   That note is all the model and the transcript ever get.
4. At checkout the agent must call `checkout_start`. Its description makes the agent ask first:
   **just for you, or a group order to split before paying?**
   - Solo: cleared.
   - Group: the agent opens `split_open(mode="prepay")`, everyone pays their share to the buyer, and
     `checkout_start` only clears once the split plugin reports it fully collected.
5. The agent calls `browser_vault_fill`. `guard.py` checks the item is this person's and the purchase
   is cleared; the runtime then asks the person to confirm the fill; then the card is typed into the
   page without passing through the model. One clearance covers one fill and expires after 15 minutes.

Cards sent in pieces, or before any site was named, are held in process memory for ten minutes and
saved when the missing part arrives. Nothing partial is written to disk.

## What the model can and cannot do

| | |
|---|---|
| Sees | Brand, last four digits, which sites a card is allowed on, opaque handles |
| Never sees | Card number, expiry, security code |
| Can | Ask for a card, list a person's cards, delete one, request a fill on an allowed site |
| Cannot | Read a card back, fill it on another site, fill someone else's card, fill without a cleared purchase and the person's confirmation |

## Honest limits

- **The card travels over iMessage and through Photon** to reach us. It is kept out of the model, the
  transcript and our state file, but it does exist in the person's own message history and in transit.
  Instinct reportedly avoids this with one-time virtual cards issued per purchase; that is the right
  next step.
  For the hackathon demo, use test card numbers only (`4242 4242 4242 4242`).
- **Not tested end to end by us:** the actual fill into a live checkout page, and the confirmation
  prompt as it appears over iMessage. Both are runtime features. Everything in the tables above marked
  "Ours" is covered by `vault/tests` and was exercised inside the running runtime.
- **A card added from the terminal** (`./gc vault add`) has no owner and is hidden from everyone
  texting in. Only cards that arrived through intake belong to a person.
- **Exact sites only.** `amazon.com` is stored as `https://amazon.com` and `https://www.amazon.com`.
  A checkout hosted on a third domain will be refused until that site is added.
- The vault key sits next to the vault file on this machine. Anyone with the laptop has both.

## Tests

```bash
python3 -m unittest discover -s vault/tests -v
```

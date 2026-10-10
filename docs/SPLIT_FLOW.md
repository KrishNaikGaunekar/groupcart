# The split flow

Code: `app/split/`. Start with `flow.py`; it is the whole product in one file.

## What happens

Bob paid for dinner with John, Susan and Charlie.

1. **Bob → his agent:** a photo of the receipt and "dinner with John, Susan and Charlie, I had the
   California roll and the Dr Pepper".
2. **Bob's agent** reads every line, the tax, the tip and the total off the photo and calls `split_open`.
3. **`split_open`** creates the split in the ledger and posts to the **agents' room**: the receipt, the
   itemized list, what Bob had, and "agents: ask your people what they had".
4. **Each other agent texts its own human** the receipt and the numbered item list: "what did you have?"
5. **John → his agent:** "the spicy ramen, one of the Sapporos, and I split the edamame with Susan".
   John's agent calls `split_claim` and posts John's answer to the room.
6. When the **last person answers**, the split finalizes itself: shares are computed and every agent
   texts its human what they owe, with the breakdown and ways to pay.
7. **John → his agent:** "pay". `split_pay` moves the money from John's Capital One account to Bob's.
   Or John says "I venmo'd him" and that is recorded instead. Bob's agent tells Bob either way.
8. When everyone has paid, the split is settled and Bob is told.

Run exactly this in a terminal, with the real model and no phones:

```bash
scripts/demo_cli.sh
```

## How shares are computed

`splitter.py`, pure functions over integer cents. Every share sums to the bill exactly.

- An item goes to whoever claimed it. Two people claiming the same item split it evenly.
- "I had half" is a stated portion (`portion: 0.5`). Open claims share what stated portions leave.
- A multi-quantity line ("2× Sapporo") is claimed by count (`count: 1`).
- Items nobody claimed are split evenly across everyone, or absorbed by the payer (`unclaimed`).
- Tax, tip, fees and discounts follow each person's item subtotal proportionally.
- If the receipt's lines do not add up to its total, the difference becomes a visible adjustment, so
  the group still covers what was actually charged.

## Tools the model can call

| Tool | Who uses it | What it does |
|---|---|---|
| `profile_set` | anyone | Save their name and Venmo / Zelle / PayPal / Cash App handles |
| `contact_add` | payer | Remember a friend's phone number under a name |
| `split_open` | payer | Open a split from a receipt; `mode: prepay` for an order not yet paid |
| `split_claim` | member | Record what their human had |
| `split_status` | anyone | Who answered, who owes, who paid, and the room transcript |
| `split_finalize` | payer | Stop waiting and send shares now |
| `split_pay` | member | Pay by Capital One transfer, or record a payment made elsewhere |
| `split_cancel` | payer | Cancel and tell everyone |
| `bank_balance` | anyone | Capital One balance and recent activity |

The model never computes a share and never texts another person. Both are done by the tools.

## The ledger

One SQLite file (`ledger.py`), by default `.groupcart-home/plugin-data/split/ledger.db`. Tables:
`people`, `contacts`, `splits`, `items`, `members`, `claims`, `room`, `outbox`, `kv`.

- `room` is the agent-to-agent conversation, one row per message, per split.
- `outbox` is every text an agent sent to a human, with whether it was delivered.

Look at them from outside a conversation:

```bash
./gc split room --watch     # the agents talking, live — good on a projector during the demo
./gc split outbox           # every text sent to people
./gc split people           # who has an agent and how they get paid
```

In a conversation, `/room` shows the transcript for your latest split.

## Why the room is not an iMessage group

The brief was for the payer's agent to create an iMessage group chat containing the other agents.
Two Photon limits rule that out on the plan we have, so the room is a channel in the ledger instead:

1. **Shared lines cannot create group chats.** On Photon's Free and Pro plans, `space.create` with more
   than one participant throws; group creation needs a Business dedicated line.
   ([Photon docs: connection and routing](https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing))
2. **A group of agents needs one phone number per agent.** We have one project, so every agent is the
   same iMessage identity.

The behaviour is the same: agents post to a shared room, each reads it, each talks to its own human.
What is missing is seeing it as a native group thread. Two ways to get that back:

- **Mirror the room into a real group** the humans made themselves and added the agent's number to. A
  shared line can post into an existing group. Not built; it is one `notifier.tell` in `Ledger.post`.
- **Dedicated lines** (Photon Business): give each agent its own runtime profile and number, and add a
  create-group endpoint to the Photon sidecar. That means a patch in `core-patches/`.

## Receipt photos

iPhone camera photos arrive as HEIC, which the runtime does not treat as an image. `images.py` converts
them to JPEG in the inbound hook, before the model sees the message. Screenshots (PNG) pass through as
they are. The payer's most recent photo (within an hour) is what `split_open` forwards to the others.

## Limits to know before the demo

- **People must text their agent first.** A shared Photon line can only message someone who messaged it.
  `contact_add` tells the agent when a friend has not done this yet.
- **Friends are found by first name** among people who have an agent. Two Johns means the agent asks
  for a phone number.
- **Venmo, Zelle, PayPal, Cash App payments are taken on the person's word.** Only Capital One
  transfers are verified.
- **Cancelling does not refund** money already sent.
- **Free-tier Gemini is about 20 requests a day per model.** One dinner is roughly 30 requests. See
  [SETUP.md](SETUP.md#gemini-quota).

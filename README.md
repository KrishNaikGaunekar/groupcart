# GroupCart

Split any bill by texting your agent a photo of the receipt.

Every friend has their own GroupCart agent in iMessage. After dinner, one person sends their agent the
receipt and says who was there. The agents take it from there: they open a room among themselves, each
one asks its own human what they had, and everyone gets a text with exactly what they owe — items, tax
and tip — plus a way to pay. Built at HackNC 2026 (Oct 10–11).

- **iMessage** through [Photon Spectrum](https://photon.codes/spectrum)
- **Gemini** as the model (it reads the receipt photo)
- **Capital One Nessie** for accounts and reimbursements
- A **card vault** so an agent can check out online without the model ever seeing a card number

## Layout

| Path | What it is |
|---|---|
| `app/split/` | **Ours.** The bill-splitting plugin: receipt → agents' room → shares → payment |
| `app/spectrum-bot/` | **Ours.** The first version: a TypeScript shopping-cart bot talking to Spectrum directly, with in-bot groups. [Its README](app/spectrum-bot/README.md) |
| `vault/cardvault/` | **Ours.** Card intake over text and the checkout gate, on top of the runtime's vault |
| `site/` | **Ours.** The website: static pages, a replay of the demo dinner, a calculator running the same share math |
| `core/` | Vendored open-source agent runtime (see below). Not edited by hand |
| `docs/` | Architecture, the split protocol, the vault, setup, hackathon rules |
| `scripts/` | Setup and the script that vendors `core/` |

## What we wrote and what we did not

`app/`, `vault/`, `site/`, `scripts/` and `docs/` were written during the hackathon. The site's photographs
fonts and mouse pointers are other people's, each used under its own free licence; see
[site/assets/CREDITS.md](site/assets/CREDITS.md).

`core/` was not. It is [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research
(MIT licence), copied in and renamed to GroupCart by `scripts/rebrand_core.py`. It gives us the agent
loop, the Photon iMessage adapter, browser automation and the encrypted vault store. Details in
[docs/UPSTREAM.md](docs/UPSTREAM.md).

## Run

Setup and run instructions are in [docs/SETUP.md](docs/SETUP.md).

The website needs none of that. It is static files:

```bash
scripts/site.sh        # http://localhost:4173
```

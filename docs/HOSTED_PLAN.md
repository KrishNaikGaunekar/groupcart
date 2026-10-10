# Hosted plan: "here's your agent's number, just text it"

Status: plan only. Nothing here is built yet except the pieces marked *exists*.

## The experience

1. Someone opens the website and enters their **name and phone number**. Nothing else.
2. The page shows: **"Text Minion at +1 (628) …"** with a tap-to-text button and an "add to contacts" button.
3. They text it. Their agent already knows their name.

No terminal, no keys, no accounts on any other service.

## Why the user needs no Photon or Nessie account

We run one instance. Every outside service is one account, ours, held on the server.

| Service | What one user needs from it | How they get it |
|---|---|---|
| Photon | Their own number to text | We register their phone on our project by API. Photon assigns each registered user a number from its pool. *Exists:* `scripts/photon_users.py`, used to set up the first number |
| Nessie | A mock bank account | Created automatically the first time they touch money. *Exists:* `app/split/bank.py` |
| Gemini | Nothing | Our key, server-side |

## What we are not doing: bot-created Photon accounts

The idea of a simulated browser signing each user up for their own Photon account is dropped:

- It is not needed. One project already gives every user their own number.
- It would mean creating accounts on Photon's service in bulk to get around the per-account user cap, with
  a script holding users' sign-in details. That is the kind of thing that gets the whole project banned
  by a sponsor, and it breaks on the first captcha or sign-in change.

The real limit is Photon's user cap, and the fix is a plan, not a scraper:

| Photon plan | Users | Cost |
|---|---|---|
| Free | 10 | $0 |
| Pro | 100 | $25/month |
| Business | Unlimited, dedicated number, group chats | $250/line/month |

Photon sponsors the track. Ask them in person for hackathon capacity (the `PHOTONHACK` code is applied
in their dashboard by whoever owns the project).

## Architecture on Azure

```
 website (static)  ──POST /signup {name, phone}──►  signup API ──► Photon users API
                                                        │               (assigns a number)
                                                        ▼
                                              ledger: name + phone
                                                        ▲
 iMessage ◄──► Photon cloud ◄──gRPC──►  runtime container (gateway + sidecar + our plugins)
                                                        │
                                              persistent disk: .groupcart-home
                                              (ledger, vault key, sessions)
```

- **One small Azure VM running Docker Compose**: the runtime container, the signup API, and a reverse
  proxy for HTTPS. A VM is simpler than a serverless container service here because the runtime holds a
  long-lived connection and needs a disk. Rough cost from memory is a few tens of dollars a month, well
  inside $300 of credits; check current pricing before committing.
- **Exactly one runtime replica.** Only one process may hold a Photon project's message stream. Never autoscale it.
- **Persistent disk** for `.groupcart-home`. Losing it loses the ledger and the vault key.
- **Secrets as environment variables on the VM**, never in the image or the repo.

## Build steps

1. **Prove the live path first.** One real text in, one reply out, one agent texting a second person.
   Still unverified; everything below depends on it.
2. **Dockerfile** for this repo: runtime-only install, plugins linked, `app/runtime/config.yaml` baked in.
   `core/` ships its own Dockerfile to start from. Untested.
3. **Signup API**: one endpoint wrapping the same call as `scripts/photon_users.py`, which also writes the
   person's name into the ledger so the agent greets them by name.
4. **Azure VM**, Compose file, disk, HTTPS.
5. **Website**: one form, one result screen. Tap-to-text is an `sms:` link. Not started on purpose.
6. **Gemini capacity**: billing on, or several keys. The free tier is about 20 requests a day per model.

## Things to decide

- **Abuse.** The form spends a limited user slot and our Gemini quota for anyone who finds it. Gate it
  with a hackathon invite code until capacity is sorted.
- **Phone ownership.** Someone can enter a number that is not theirs. Low harm (the agent only replies to
  people who text it first), but it burns a slot. A texted confirmation code fixes it later.
- **Contact card.** Two ways to make the agent show up as "Minion" with a picture: a downloadable contact
  file from the result screen (works on any plan), or Photon's contact sharing (their pricing page lists
  it; which plans include it is unconfirmed).
- **The Minion picture.** The Minions are Universal's characters. A meme image of one as the face of a
  public product and a public repo is their artwork used without permission. Fine as a joke in a private
  demo; for the site and the repo, use an original mascot or have someone on the team pick and own that call.

## Limits that stay

- Shared Photon lines cannot start a conversation or create group chats (see [SPLIT_FLOW.md](SPLIT_FLOW.md)).
- Each person gets a *different* agent number, so "text this one number" marketing does not work until a
  dedicated line.
- Card details still travel over iMessage (see [VAULT.md](VAULT.md)); a hosted version raises the stakes on that.

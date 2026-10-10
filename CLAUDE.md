**NEVER list Claude (or any AI) as a contributor: no `Co-Authored-By` trailer, no "Generated with" line, no AI author or committer. Every commit is authored by WillieTheWhale only.**

# GroupCart

Full guide coming in the next commits. Until then: `core/` is the vendored agent runtime (do not hand-edit),
`app/` is our code, `vault/` is the card-vault layer, `docs/` explains each.

## Git rules

- Commit as `WillieTheWhale` (already the configured git identity). Never add AI attribution of any kind.
- Commit often, in small pieces, with short imperative subjects. Teammates pull from `main` during the hackathon.
- Never commit `.env` or anything under `.groupcart-home/`.

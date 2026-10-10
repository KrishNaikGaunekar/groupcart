# Upstream

Everything in this directory is a vendored, rebranded copy of
**Hermes Agent** by Nous Research — https://github.com/NousResearch/hermes-agent —
used under the MIT licence (see `LICENSE` in this directory, unmodified).

- Upstream commit: `66605471e9f0b0832abbefaf625ce08e948ca540`
- Vendored by: `scripts/rebrand_core.py`
- Rebrand: `hermes` -> `groupcart`, `Hermes` -> `GroupCart`, `HERMES` -> `GROUPCART`
  in file contents and in file and directory names.
- Left as upstream wrote them: external URLs, `NousResearch/...` slugs, model ids
  and third-party npm package names (2946 occurrences).
- Local changes on top of the rebrand: the patch series in `core-patches/`
  (0 applied).

Do not hand-edit files here. Put new behaviour in `app/` or `vault/`; if the
runtime itself has to change, add a patch to `core-patches/`.
See `docs/UPSTREAM.md` in the repo root.

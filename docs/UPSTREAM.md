# The vendored runtime (`core/`)

`core/` is [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research, MIT licence,
at upstream commit `66605471e9f0b0832abbefaf625ce08e948ca540`. It was copied in — not forked, no upstream
history — and renamed to GroupCart by `scripts/rebrand_core.py`.

We use it for: the agent loop, the Gemini provider, the Photon iMessage adapter and its Node sidecar,
browser automation, the encrypted vault, and the plugin system our own code hangs off.

## Rules

1. **Do not hand-edit `core/`.** New behaviour goes in `app/` or `vault/` as a plugin.
2. If the runtime itself must change, add a patch file to `core-patches/` (create the folder; the
   rebrand script applies `core-patches/*.patch` in order). There are none today.
3. `core/LICENSE` stays exactly as upstream wrote it. The MIT licence requires the copyright notice to
   travel with the code. `core/UPSTREAM.md` records the commit.

## What the rename did

| | Count |
|---|---|
| Occurrences renamed (`hermes`→`groupcart`, `Hermes`→`GroupCart`, `HERMES`→`GROUPCART`) | 138,916 in 10,660 files |
| Files and folders renamed | 267 |
| Occurrences deliberately left | 2,946 |

So the command is `groupcart`, the Python packages are `groupcart_cli`, `groupcart_constants`…, the home
directory variable is `GROUPCART_HOME`, and the iMessage wake word in group chats is "groupcart".

### What was left as "hermes", and why

Renaming these would make them point at things that do not exist:

- **External URLs** on GitHub, nousresearch.com, npm and similar hosts. Links to upstream docs still work.
  The runtime's toolchain is downloaded from `hermes-assets.nousresearch.com`; renaming that host would
  break `scripts/setup.sh`.
- **`NousResearch/...` repository slugs and Docker image names.**
- **Model ids** such as `hermes-4-405b` and `Hermes-3`. They name Nous's language models, not this software.
- **Two third-party npm packages**, `hermes-parser` and `hermes-estree`.

To rename those too, delete the matching entries from `PROTECTED` in `scripts/rebrand_core.py` and
re-vendor. Expect broken links and a broken setup.

### Known side effects of the rename

- External plugins written for Hermes will not load (entry-point group and manifest fields were renamed).
- `groupcart update` cannot work: `core/` has no git history of its own. Update by re-vendoring.
- Nous Portal sign-in will not work (its OAuth client id was renamed). We use Gemini, so it is unused.
- `groupcart photon setup` would create a new Photon project called "GroupCart Agent". We do not run it;
  our project credentials come from `.env`.

## Updating to a newer upstream

```bash
git clone --depth 1 https://github.com/NousResearch/hermes-agent.git /tmp/upstream
rm -rf core
python3 scripts/rebrand_core.py --src /tmp/upstream
scripts/setup.sh
python3 -m unittest discover -s app/tests && python3 -m unittest discover -s vault/tests
scripts/demo_cli.sh
```

Some upstream files are ignored by upstream's own `.gitignore` and were force-added. After re-vendoring,
compare `find core -type f | wc -l` with `git ls-files core | wc -l` and `git add -f` what is missing.

## The two places our code depends on runtime internals

Both are internal import paths, which upstream does not promise to keep stable. Check them first after
an update:

- `app/split/notify.py` → `tools.send_message_tool.send_message_tool`
- `vault/cardvault/store.py` → `agent.vault_store.get_vault_store`

Everything else goes through the documented plugin API: `ctx.register_tool`, `register_hook`
(`pre_llm_call`, `pre_gateway_dispatch`, `transform_tool_result`), `register_middleware`
(`tool_execution`, `llm_request`), `register_command`, `register_cli_command`, `dispatch_tool`.
The plugin guide is `core/website/docs/developer-guide/plugins/index.md`.

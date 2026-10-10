# GroupCart CLI Reference

Live sources when anything looks stale: `groupcart --help`, `groupcart <command> --help`,
https://hermes-agent.nousresearch.com/docs/reference/cli-commands

### Global Flags

```
groupcart [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
groupcart chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
groupcart setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
groupcart model                Interactive model/provider picker
groupcart fallback [add|remove|list]  Fallback provider chain
groupcart config [show|edit|get|set|unset|path|env-path|check|migrate]
groupcart login / logout       OAuth sign-in / clear stored auth
groupcart doctor [--fix]       Check dependencies and config
groupcart status [--full]      Component summary (--full: every section)
```

### Tools & Skills

```
groupcart tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

groupcart skills list|browse|search QUERY|inspect ID
groupcart skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
groupcart skills config        Enable/disable skills per platform
groupcart skills check|update|uninstall|publish PATH
groupcart skills tap add REPO  Add a GitHub repo as a skill source
groupcart bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
groupcart mcp add NAME (--url or --command) | remove | list | test NAME
groupcart mcp catalog | install NAME     Curated catalog install
groupcart mcp configure NAME             Toggle tool selection
groupcart mcp serve                      Run GroupCart as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
groupcart gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `groupcart photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/

### Sessions

```
groupcart sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
groupcart cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
groupcart webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
groupcart profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
groupcart profile rename A B | alias NAME | export NAME | import FILE
groupcart profile migrate-identity A B   Retry a completed rename's session/routing identity migration
```

### Credentials & Pools

```
groupcart auth                 Interactive credential manager
groupcart auth add [PROVIDER]  Add OAuth or API-key credential (nous, openai-codex, qwen-oauth, …)
groupcart auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
groupcart desktop / gui        Native desktop app
groupcart dashboard            Web admin panel + embedded chat (--stop / --status)
groupcart proxy                OpenAI-compatible local proxy backed by an OAuth provider
groupcart portal               Quick setup / sign in via Nous Portal
groupcart kanban <verb>        Multi-agent work-queue board
groupcart project              Named multi-folder workspaces
groupcart skin list|use|set    Switch/tweak skins (see references/themes.md)
groupcart pets <verb>          Pet mascots (see references/petdex.md)
groupcart memory setup|status|off|reset   Memory provider
groupcart secrets bitwarden|onepassword   External secret stores
groupcart moa                  Mixture-of-Agents slots
groupcart hooks / security / backup / import / checkpoints / console
groupcart logs [-f] [errors]   View agent/error logs
groupcart send                 One-off message through a gateway platform
groupcart pairing / plugins / insights / journey / computer-use
groupcart acp                  ACP server (IDE integration)
groupcart completion bash|zsh|fish
groupcart update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `groupcart photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `groupcart config edit` · [Configuration docs](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) |
| Tools / toolsets | `groupcart tools list` · [Tools reference](https://hermes-agent.nousresearch.com/docs/reference/tools-reference) |
| Skills catalog | `groupcart skills browse` · [Skills catalog](https://hermes-agent.nousresearch.com/docs/reference/skills-catalog) |
| Provider setup | `groupcart model` · [Providers guide](https://hermes-agent.nousresearch.com/docs/integrations/providers) |
| Env variables | `groupcart config env-path` · [Env vars reference](https://hermes-agent.nousresearch.com/docs/reference/environment-variables) |
| Gateway logs | `~/.groupcart/logs/gateway.log` (or `groupcart logs`) |
| Sessions | `groupcart sessions browse` (reads state.db) |

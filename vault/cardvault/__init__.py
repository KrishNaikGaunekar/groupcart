"""GroupCart card vault: cards over text, per-person scoping, and the checkout gate.

The secret store and the model-blind page fill are the runtime's own vault
(core/agent/vault_store.py, core/tools/browser_vault_tool.py). This plugin is
what makes that vault usable by many people over iMessage. See docs/VAULT.md.
"""
import json
import logging

logger = logging.getLogger(__name__)


def register(ctx) -> None:
    from .cards import find_numbers
    from .guard import Guard
    from .intake import NOTE, Intake
    from .state import State
    from .store import RuntimeVault
    from .tools import ALL, Tools

    state, vault = State(), RuntimeVault()
    intake, guard = Intake(state, vault), Guard(state, vault)

    def split_lookup(split_id: str) -> tuple[bool, list[str]]:
        """Ask the split plugin, through the tool registry, whether a prepay split is fully collected."""
        if not ctx.has_plugin("split"):
            return False, ["the split plugin is not loaded"]
        splits = json.loads(ctx.dispatch_tool("split_status", {"split_id": split_id})).get("splits") or []
        if not splits:
            return False, ["no such split for this person"]
        return bool(splits[0].get("collected")), [p["name"] for p in splits[0].get("people", []) if p.get("paid") == "unpaid"]

    def on_inbound(event, **_):
        source = getattr(event, "source", None)
        sender, text = getattr(source, "user_id", None), getattr(event, "text", "") or ""
        if not sender or not text:
            return None
        try:
            replacement = intake.on_text(str(sender), text)
        except Exception:
            logger.exception("card intake failed")
            if not find_numbers(text):
                return None
            # Fail closed: our own bug must not be the reason a card number reaches the model.
            replacement = NOTE + "They sent a card number but saving it failed, so nothing was stored. Apologize and ask them to try again in a bit."
        return {"action": "rewrite", "text": replacement} if replacement else None

    handlers = Tools(state, intake, split_lookup).handlers()
    for schema in ALL:
        ctx.register_tool(name=schema["name"], toolset="cardvault", schema=schema, handler=handlers[schema["name"]])
    ctx.register_hook("pre_gateway_dispatch", on_inbound)
    ctx.register_hook("transform_tool_result", guard.scrub_result)
    ctx.register_middleware("tool_execution", guard.around_tool)
    ctx.register_middleware("llm_request", guard.scrub_request)

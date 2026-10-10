"""Who may use which vault item, and when a card may be filled.

The runtime's vault is one store per runtime, but one runtime serves every
friend. This wraps the vault tools so that:

  - a person only sees and fills items they saved themselves;
  - a card is filled only after that person's purchase cleared the checkout gate
    (tools.checkout_start), and one clearance covers one fill.

It also strips card numbers from anything headed to the model, as a second net
under intake.py.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable

from . import whoami
from .cards import scrub
from .state import State
from .store import RuntimeVault

logger = logging.getLogger(__name__)

VAULT_TOOLS = ("browser_vault_list", "browser_vault_fill", "browser_vault_save_login", "browser_vault_enter_code")


def _refuse(error_type: str, message: str) -> str:
    return json.dumps({"success": False, "error_type": error_type, "error": message})


class Guard:
    def __init__(self, state: State, vault: RuntimeVault):
        self.state = state
        self.vault = vault

    # -- tool_execution middleware ----------------------------------------------------

    def around_tool(self, tool_name: str, args: dict, next_call: Callable[[Any], Any], **_: Any) -> Any:
        me = whoami.handle()
        if tool_name not in VAULT_TOOLS or not me:
            return next_call(args)  # not a vault tool, or the operator at the terminal
        try:
            refusal, spend = self._check(tool_name, args or {}, me)
        except Exception:
            # The runtime treats a raising middleware as "skip it", which would fail open.
            logger.exception("vault guard failed; refusing %s", tool_name)
            return _refuse("vault_guard_error", "The vault guard could not verify this request, so it was refused.")
        if refusal:
            return refusal
        result = next_call(args)
        try:
            return self._after(tool_name, result, me, spend)
        except Exception:
            logger.exception("vault guard post-processing failed for %s", tool_name)
            return _refuse("vault_guard_error", "The vault result could not be checked, so it was withheld.") \
                if tool_name == "browser_vault_list" else result

    def _check(self, tool_name: str, args: dict, me: str) -> tuple[str | None, bool]:
        item_id = str(args.get("handle") or "")
        if tool_name not in ("browser_vault_fill", "browser_vault_enter_code") or not item_id.startswith("vault_"):
            return None, False
        if self.state.owner_of(item_id) != me:
            return _refuse("not_yours", "That vault item belongs to someone else. Use browser_vault_list to see this person's own items."), False
        kind, origin = self.vault.kind_and_origin(item_id)
        if kind != "payment":
            return None, False
        if not self.state.cleared(me, origin or ""):
            return _refuse("checkout_not_cleared",
                           "No cleared purchase for this site. Ask whether this is a group order to split first, "
                           "then call checkout_start; the card can be filled once it returns cleared."), False
        return None, True

    def _after(self, tool_name: str, result: Any, me: str, spend: bool) -> Any:
        if not isinstance(result, str):
            return result
        if tool_name == "browser_vault_list":
            data = json.loads(result)
            data["items"] = [i for i in data.get("items", [])
                             if not str(i.get("handle", "")).startswith("vault_") or self.state.owner_of(i["handle"]) == me]
            return json.dumps(data, ensure_ascii=False)
        if tool_name == "browser_vault_save_login":
            saved = json.loads(result).get("handle")
            if saved:
                self.state.set_owner(str(saved), me)
        if spend and json.loads(result).get("success"):
            self.state.spend_clearance(me)
        return result

    # -- keeping card numbers away from the model ---------------------------------------

    def scrub_request(self, request: dict, **_: Any) -> dict | None:
        """llm_request middleware: no card number leaves for the model provider."""
        changed = False
        for message in request.get("messages") or []:
            content = message.get("content") if isinstance(message, dict) else None
            if isinstance(content, str):
                clean = scrub(content)
                if clean is not content:
                    message["content"], changed = clean, True
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and isinstance(part.get("text"), str):
                        clean = scrub(part["text"])
                        if clean is not part["text"]:
                            part["text"], changed = clean, True
        return {"request": request, "source": "cardvault", "reason": "card number removed"} if changed else None

    def scrub_result(self, result: str = "", **_: Any) -> str | None:
        """transform_tool_result hook: no tool output hands the model a card number."""
        if not isinstance(result, str):
            return None
        clean = scrub(result)
        return None if clean is result else clean

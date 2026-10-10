"""What the model can do about cards. Nothing here returns or accepts a card number."""
from __future__ import annotations

import json
import logging
from typing import Callable, Optional

from . import whoami
from .intake import Intake, origins_for, site_names
from .state import State

logger = logging.getLogger(__name__)

CARD_REQUEST = {
    "name": "card_request",
    "description": (
        "Get ready to receive this person's payment card for specific websites. Call it when they want you to buy "
        "things for them online: first ask which sites the card may be used on, call this with those sites, then "
        "ask them to text the card number, expiry and security code in one message. You will never see the card: "
        "the message is intercepted, the details go into an encrypted vault bound to those sites only, and you "
        "get a note with the last four digits. Never ask them to repeat a card number to you and never type one "
        "into a page yourself."
    ),
    "parameters": {
        "type": "object",
        "properties": {"sites": {"type": "array", "items": {"type": "string"},
                                 "description": "Sites the card may be used on, e.g. ['amazon.com', 'target.com']"}},
        "required": ["sites"],
    },
}

CARD_STATUS = {
    "name": "card_status",
    "description": "Which cards this person has in the vault (brand and last four only) and the sites each is allowed on.",
    "parameters": {"type": "object", "properties": {}},
}

CARD_FORGET = {
    "name": "card_forget",
    "description": "Delete one of this person's cards from the vault, by its last four digits.",
    "parameters": {"type": "object", "properties": {"last4": {"type": "string"}}, "required": ["last4"]},
}

CHECKOUT_START = {
    "name": "checkout_start",
    "description": (
        "The gate every online purchase passes before any card is used. Before calling it, ask the person one "
        "question: is this order just for them, or a group order to split before paying? If it is a group order, "
        "open the split first with split_open(mode='prepay') and pass its split_id here; this only clears once "
        "everyone has paid their share. If it is just them, pass group_order='solo'. When it returns cleared, "
        "fill the card with browser_vault_fill; the person is then asked to confirm the card fill themselves."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "site": {"type": "string", "description": "Where the order is being placed, e.g. 'amazon.com'"},
            "total": {"type": "number", "description": "Order total in dollars as shown at checkout"},
            "what": {"type": "string", "description": "One line on what is being bought"},
            "group_order": {"type": "string", "enum": ["solo", "split"],
                            "description": "The person's answer: just them, or a group order split first"},
            "split_id": {"type": "string", "description": "Required when group_order is 'split'"},
        },
        "required": ["site", "total", "what", "group_order"],
    },
}

ALL = (CARD_REQUEST, CARD_STATUS, CARD_FORGET, CHECKOUT_START)

# split_id -> (collected, names still unpaid). Wired to the split plugin at registration.
SplitLookup = Callable[[str], tuple[bool, list[str]]]


class Tools:
    def __init__(self, state: State, intake: Intake, split_lookup: Optional[SplitLookup] = None):
        self.state = state
        self.intake = intake
        self.split_lookup = split_lookup

    def handlers(self) -> dict[str, Callable[..., str]]:
        def wrap(fn: Callable[[str, dict], dict]) -> Callable[..., str]:
            def handler(args: dict, **kwargs) -> str:
                me = whoami.handle()
                if not me:
                    return json.dumps({"error": "no sender on this conversation; cards belong to a phone-number identity"})
                try:
                    return json.dumps(fn(me, args or {}))
                except Exception as exc:
                    logger.exception("cardvault tool failed")
                    return json.dumps({"error": f"{type(exc).__name__}: {exc}"})
            return handler

        return {"card_request": wrap(self.card_request), "card_status": wrap(self.card_status),
                "card_forget": wrap(self.card_forget), "checkout_start": wrap(self.checkout_start)}

    def card_request(self, me: str, args: dict) -> dict:
        origins = [o for site in args.get("sites") or [] for o in origins_for(str(site))]
        if not origins:
            return {"error": "name at least one site, like amazon.com"}
        saved = self.intake.on_sites(me, origins)
        if saved:
            return {"saved": True, "note": saved}
        self.state.set_pending(me, origins)
        return {"ready": True, "sites": site_names(origins),
                "next": "Ask them to text the card number, expiry (MM/YY) and security code in ONE message. "
                        "Tell them you will not see it: it goes straight into the vault for those sites."}

    def card_status(self, me: str, args: dict) -> dict:
        cards = [{"card": f"{c['brand']} ending {c['last4']}", "sites": site_names(list(c["items"]))} for c in self.state.cards_of(me)]
        return {"cards": cards} if cards else {"cards": [], "note": "no card on file; use card_request to add one"}

    def card_forget(self, me: str, args: dict) -> dict:
        gone = self.state.forget_card(me, str(args.get("last4", "")).strip())
        for item_id in gone:
            self.intake.secrets.remove(item_id)
        return {"deleted": bool(gone)}

    def checkout_start(self, me: str, args: dict) -> dict:
        origins = origins_for(str(args.get("site", "")))
        if not origins:
            return {"cleared": False, "error": "which site is this order on?"}
        cents = int(round(float(args.get("total") or 0) * 100))
        if cents <= 0:
            return {"cleared": False, "error": "need the order total"}
        usable = [c for c in self.state.cards_of(me) if any(o in c["items"] for o in origins)]
        if not usable:
            return {"cleared": False, "card_on_file": False,
                    "next": f"They have no card allowed on {site_names(origins)}. Offer to set one up with card_request."}
        decision, split_id = args.get("group_order"), (str(args.get("split_id") or "").strip().upper() or None)
        if decision == "split":
            if not split_id:
                return {"cleared": False, "next": "Open the split first with split_open(mode='prepay'), then pass its split_id."}
            if self.split_lookup is None:
                return {"cleared": False, "error": "the split plugin is not loaded, so a group order cannot be verified"}
            collected, unpaid = self.split_lookup(split_id)
            if not collected:
                return {"cleared": False, "waiting_on": unpaid,
                        "next": "Not everyone has paid their share yet. Tell them who is outstanding; try again once they have paid."}
        elif decision != "solo":
            return {"cleared": False, "next": "Ask them first: just for you, or a group order to split before paying?"}
        self.state.clear_checkout(me, origins, amount_cents=cents, decision=decision, split_id=split_id)
        return {"cleared": True, "card": f"{usable[0]['brand']} ending {usable[0]['last4']}", "valid_for_minutes": 15,
                "next": "Go to the payment step and call browser_vault_list, then browser_vault_fill with this person's card "
                        "for this site. They will be asked to confirm the fill."}

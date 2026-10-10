"""Runtime hooks: what the agent needs to know before it answers.

One process serves every friend, so each turn starts by telling the model whose
agent it is and what is pending for that person. That is what makes a member's
agent understand "I had the ramen" as an answer to a split it was asked about
by another agent.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

from . import session
from .ledger import normalize_handle
from .money import fmt

logger = logging.getLogger(__name__)

_IMAGE_TYPES = ("image/", "photo")


def remember_receipt(event: Any, **_: Any) -> None:
    """pre_gateway_dispatch: make the photo readable, and note it so split_open can forward the receipt."""
    try:
        from .images import normalize_event_images

        normalize_event_images(event)
        source = getattr(event, "source", None)
        sender = getattr(source, "user_id", None)
        urls, types = list(getattr(event, "media_urls", None) or []), list(getattr(event, "media_types", None) or [])
        if not sender or not urls:
            return None
        for index, url in enumerate(urls):
            kind = types[index] if index < len(types) else ""
            if any(marker in str(kind).lower() for marker in _IMAGE_TYPES) or str(url).lower().endswith(
                    (".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif")):
                from .tools import flow

                flow().ledger.update_person(normalize_handle(sender), last_image=str(url), last_image_at=time.time())
                break
    except Exception:  # a bookkeeping failure must never hold up a message
        logger.debug("could not record inbound image", exc_info=True)
    return None


def turn_context(sender_id: str = "", platform: str = "", **_: Any) -> Optional[dict]:
    """pre_llm_call: whose agent this is and what is waiting on them."""
    speaker = session.current()
    if not speaker.known and sender_id:  # the hook payload also names the sender
        speaker = session.Speaker(normalize_handle(str(sender_id)), "", platform or "photon")
    if not speaker.known:
        return None
    try:
        from .tools import flow

        f = flow()
        person = f.ledger.touch_person(speaker.handle, chat_id=speaker.chat_id, platform=speaker.platform)
        lines = []
        if person["name"]:
            lines.append(f"You are {person['name']}'s GroupCart agent.")
        else:
            lines.append("You are this person's GroupCart agent and do not know their name yet. Ask what friends call "
                         "them and save it with profile_set before anything else.")
        for split in f.ledger.splits_for(speaker.handle):
            member = f.ledger.member(split["id"], speaker.handle)
            payer = f.ledger.display_name(split["payer"])
            if split["payer"] == speaker.handle:
                waiting = [f.ledger.display_name(m["handle"]) for m in f.ledger.members(split["id"])
                           if (m["state"] == "asked" if split["status"] == "collecting" else m["paid"] == "unpaid")]
                what = "waiting to hear what they had from" if split["status"] == "collecting" else "unpaid:"
                lines.append(f"Their split {split['id']} ({split['merchant']}, {fmt(split['total_cents'])}) — "
                             + (f"{what} {', '.join(waiting)}." if waiting else "everyone is done."))
            elif split["status"] == "collecting" and member["state"] == "asked":
                lines.append(
                    f"WAITING ON THEM — {split['id']}: {payer} paid {split['merchant']} ({fmt(split['total_cents'])}) "
                    f"and you asked what they had. Items:\n{f._item_list(split['id'])}\n"
                    "When they answer, call split_claim with those items (nothing=true if they had nothing).")
            elif split["status"] == "final" and member["paid"] == "unpaid":
                lines.append(
                    f"THEY OWE — {split['id']}: {fmt(member['owes_cents'])} to {payer} for {split['merchant']}. "
                    "'pay' means split_pay(method='capital_one'); 'I venmo'd/zelled it' means split_pay with that method.")
        return {"context": "[GroupCart context for you, the agent — not written by the user]\n" + "\n".join(lines)}
    except Exception:
        logger.debug("could not build split context", exc_info=True)
        return None

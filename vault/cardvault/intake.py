"""Catch card details in an inbound text before the model or the transcript sees them.

The gateway calls `Intake.on_text` for every message, ahead of the agent. When a
message carries card details they go straight into the runtime's encrypted vault,
bound to the sites the person allowed, and the message is replaced by a note that
mentions only the last four digits. The model works from that note.
"""
from __future__ import annotations

import time
from typing import Optional, Protocol
from urllib.parse import urlsplit

from .cards import Card, parse
from .state import State

HOLD_SECONDS = 10 * 60
NOTE = "[GroupCart vault note for the agent — the person's own message was withheld because it contained card details] "


class Secrets(Protocol):
    """Where the secret part goes. In the runtime this is the encrypted vault (store.py)."""

    def add_payment(self, label: str, card: Card, origin: str) -> str: ...
    def remove(self, item_id: str) -> None: ...


def origins_for(site: str) -> list[str]:
    """A site as the exact origins a checkout might use: amazon.com -> https://amazon.com, https://www.amazon.com."""
    site = (site or "").strip().lower()
    if not site:
        return []
    host = urlsplit(site if "://" in site else f"https://{site}").hostname or ""
    if not host or "." not in host:
        return []
    if host.startswith("www."):
        return [f"https://{host}", f"https://{host[4:]}"]
    return [f"https://{host}", f"https://www.{host}"] if host.count(".") == 1 else [f"https://{host}"]


def site_names(origins: list[str]) -> str:
    hosts = []
    for origin in origins:
        host = (urlsplit(origin).hostname or origin).removeprefix("www.")
        if host not in hosts:
            hosts.append(host)
    return ", ".join(hosts)


class Intake:
    def __init__(self, state: State, secrets: Secrets):
        self.state = state
        self.secrets = secrets
        # Incomplete or unassigned details wait here, in process memory only, never on disk.
        self._held: dict[str, tuple[Card, float]] = {}

    def _holding(self, handle: str) -> Optional[Card]:
        entry = self._held.get(handle)
        if entry and time.time() - entry[1] <= HOLD_SECONDS:
            return entry[0]
        self._held.pop(handle, None)
        return None

    def on_text(self, handle: str, text: str) -> Optional[str]:
        """Replacement text when the message carried card details; None for an ordinary message."""
        seen, held = parse(text), self._holding(handle)
        if not seen.number and not (held and (seen.exp_month or seen.cvc)):
            return None
        card = seen.merge(held) if held else seen
        if not card.complete:
            self._held[handle] = (card, time.time())
            have = [name for name, value in (("number", card.number), ("expiry", card.exp_month), ("security code", card.cvc)) if value]
            return (NOTE + f"They sent part of a card ({' and '.join(have)}). It is being held, unsaved. "
                    f"Still needed: {', '.join(card.missing)}. Ask for just that.")
        origins = self.state.take_pending(handle, consume=True)
        if not origins:
            self._held[handle] = (card, time.time())
            return (NOTE + f"They sent a {card.brand} ending {card.last4} but have not said which sites it may be used on. "
                    "It is held for ten minutes, unsaved. Ask which sites, then call card_request with them — no need to resend the card.")
        return self._save(handle, card, origins)

    def on_sites(self, handle: str, origins: list[str]) -> Optional[str]:
        """card_request was called: save a card that is already being held, if there is a complete one."""
        held = self._holding(handle)
        if held and held.complete:
            self.state.take_pending(handle, consume=True)
            return self._save(handle, held, origins)
        return None

    def _save(self, handle: str, card: Card, origins: list[str]) -> str:
        items = {origin: self.secrets.add_payment(f"{card.brand} ••{card.last4}", card, origin) for origin in origins}
        self.state.record_card(handle, last4=card.last4, brand=card.brand, items=items)
        self._held.pop(handle, None)
        return (NOTE + f"Their {card.brand} ending {card.last4} is now locked in the vault for {site_names(origins)}. "
                "You never saw the number and cannot retrieve it. Tell them it is saved, that it only works on those "
                "sites, and that they will be asked to confirm before it is ever used.")

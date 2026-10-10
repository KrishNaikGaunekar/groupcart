"""The bridge to the runtime's encrypted vault (core/agent/vault_store.py).

This is the only module here that touches secret values, and it only passes them
through: card fields go in, an opaque item id comes out.
"""
from __future__ import annotations

from typing import Optional

from .cards import Card


class RuntimeVault:
    def _store(self):
        from agent.vault_store import get_vault_store  # runtime import

        return get_vault_store()

    def add_payment(self, label: str, card: Card, origin: str) -> str:
        secret = {"card_number": card.number, "exp_month": card.exp_month, "exp_year": card.exp_year, "cvc": card.cvc}
        if card.postal_code:
            secret["billing_postal_code"] = card.postal_code
        return self._store().add_item("payment", label, secret, origin=origin).id

    def remove(self, item_id: str) -> None:
        self._store().remove_item(item_id)

    def kind_and_origin(self, item_id: str) -> tuple[Optional[str], Optional[str]]:
        meta = self._store().get_meta(item_id)
        return (meta.kind, meta.origin) if meta else (None, None)

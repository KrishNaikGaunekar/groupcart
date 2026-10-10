"""What the card layer remembers. None of it is secret.

Secrets (the card number, expiry, CVC) live only in the runtime's encrypted
vault. This file records who owns which vault item, which sites each person
allowed, and which purchases have cleared the checkout gate.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Optional

CLEARANCE_SECONDS = 15 * 60
PENDING_SECONDS = 30 * 60


def default_path() -> Path:
    override = os.environ.get("GROUPCART_CARDVAULT_STATE")
    if override:
        return Path(override).expanduser()
    from plugins.plugin_storage import plugin_data_dir  # runtime import

    return plugin_data_dir("cardvault") / "state.json"


class State:
    def __init__(self, path: Optional[os.PathLike | str] = None):
        self.path = Path(path) if path else default_path()
        self._lock = threading.RLock()

    def _load(self) -> dict[str, Any]:
        try:
            data = json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            data = {}
        for key in ("owners", "cards", "pending", "clearances"):
            data.setdefault(key, {})
        return data

    def _save(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        os.replace(tmp, self.path)

    # -- sites a person is about to send a card for -------------------------------

    def set_pending(self, handle: str, origins: list[str]) -> None:
        with self._lock:
            data = self._load()
            data["pending"][handle] = {"origins": origins, "at": time.time()}
            self._save(data)

    def take_pending(self, handle: str, *, consume: bool) -> Optional[list[str]]:
        with self._lock:
            data = self._load()
            entry = data["pending"].get(handle)
            if not entry or time.time() - entry["at"] > PENDING_SECONDS:
                return None
            if consume:
                del data["pending"][handle]
                self._save(data)
            return entry["origins"]

    # -- ownership ------------------------------------------------------------------

    def record_card(self, handle: str, *, last4: str, brand: str, items: dict[str, str]) -> None:
        """items maps origin -> vault item id."""
        with self._lock:
            data = self._load()
            data["cards"].setdefault(handle, []).append({"last4": last4, "brand": brand, "items": items, "at": time.time()})
            for item_id in items.values():
                data["owners"][item_id] = handle
            self._save(data)

    def set_owner(self, item_id: str, handle: str) -> None:
        with self._lock:
            data = self._load()
            data["owners"][item_id] = handle
            self._save(data)

    def owner_of(self, item_id: str) -> Optional[str]:
        return self._load()["owners"].get(item_id)

    def cards_of(self, handle: str) -> list[dict]:
        return self._load()["cards"].get(handle, [])

    def forget_card(self, handle: str, last4: str) -> list[str]:
        """Drop a person's card; returns the vault item ids to delete."""
        with self._lock:
            data = self._load()
            keep, gone = [], []
            for card in data["cards"].get(handle, []):
                if card["last4"] == last4:
                    gone += list(card["items"].values())
                else:
                    keep.append(card)
            data["cards"][handle] = keep
            for item_id in gone:
                data["owners"].pop(item_id, None)
            self._save(data)
            return gone

    # -- checkout gate --------------------------------------------------------------

    def clear_checkout(self, handle: str, origins: list[str], *, amount_cents: int, decision: str,
                       split_id: Optional[str] = None) -> None:
        with self._lock:
            data = self._load()
            data["clearances"][handle] = {"origins": origins, "amount_cents": amount_cents, "decision": decision,
                                          "split_id": split_id, "at": time.time()}
            self._save(data)

    def cleared(self, handle: str, origin: str) -> Optional[dict]:
        entry = self._load()["clearances"].get(handle)
        if entry and origin in entry["origins"] and time.time() - entry["at"] <= CLEARANCE_SECONDS:
            return entry
        return None

    def spend_clearance(self, handle: str) -> None:
        """One clearance, one card fill."""
        with self._lock:
            data = self._load()
            if data["clearances"].pop(handle, None) is not None:
                self._save(data)

"""The shared ledger: people, splits, claims, the agents' room and the outbox.

One SQLite file that every user's agent reads and writes. It is the only state
the split flow has, so a split survives gateway restarts and can be watched
from another process (`./gc split room --watch`).
"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Iterable, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS people (
    handle TEXT PRIMARY KEY,           -- E.164 phone or email: the iMessage sender id
    name TEXT,
    chat_id TEXT,                      -- where this person's agent reaches them
    platform TEXT,
    venmo TEXT, zelle TEXT, paypal TEXT, cashapp TEXT,
    bank_customer_id TEXT, bank_account_id TEXT,
    last_image TEXT, last_image_at REAL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (  -- one person's private nicknames for others
    owner TEXT NOT NULL, nickname TEXT NOT NULL, handle TEXT NOT NULL,
    PRIMARY KEY (owner, nickname)
);
CREATE TABLE IF NOT EXISTS splits (
    id TEXT PRIMARY KEY,
    payer TEXT NOT NULL,
    merchant TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'settle',        -- settle: already paid; prepay: collect before paying
    status TEXT NOT NULL DEFAULT 'collecting',  -- collecting | final | settled | cancelled
    tax_cents INTEGER NOT NULL DEFAULT 0,
    tip_cents INTEGER NOT NULL DEFAULT 0,
    fees_cents INTEGER NOT NULL DEFAULT 0,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    unclaimed TEXT NOT NULL DEFAULT 'even',
    receipt_path TEXT,
    bank_purchase_id TEXT,
    created_at REAL NOT NULL,
    finalized_at REAL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    split_id TEXT NOT NULL, label TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1, total_cents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
    split_id TEXT NOT NULL, handle TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'asked',        -- asked | claimed
    owes_cents INTEGER,                         -- set when the split is finalized
    breakdown TEXT,                             -- JSON of the finalized share
    paid TEXT NOT NULL DEFAULT 'unpaid',        -- unpaid | paid | payer
    paid_via TEXT, paid_ref TEXT, paid_at REAL,
    PRIMARY KEY (split_id, handle)
);
CREATE TABLE IF NOT EXISTS claims (
    split_id TEXT NOT NULL, item_id INTEGER NOT NULL, handle TEXT NOT NULL, portion REAL,
    PRIMARY KEY (split_id, item_id, handle)
);
CREATE TABLE IF NOT EXISTS room (               -- the agent-to-agent conversation, per split
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    split_id TEXT NOT NULL, ts REAL NOT NULL,
    speaker TEXT NOT NULL,                      -- handle of the person whose agent is talking
    kind TEXT NOT NULL, body TEXT NOT NULL, media TEXT
);
CREATE TABLE IF NOT EXISTS outbox (             -- every message an agent sent to a human
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL, to_handle TEXT NOT NULL, body TEXT NOT NULL, media TEXT,
    split_id TEXT, delivered INTEGER NOT NULL DEFAULT 0, error TEXT
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no look-alikes: easy to read back over text
PROFILE_FIELDS = ("name", "venmo", "zelle", "paypal", "cashapp")


def default_path() -> Path:
    """GROUPCART_SPLIT_DB if set, else the runtime's per-plugin data dir."""
    override = os.environ.get("GROUPCART_SPLIT_DB")
    if override:
        return Path(override).expanduser()
    from plugins.plugin_storage import plugin_data_dir  # runtime import: only reachable inside core

    return plugin_data_dir("split") / "ledger.db"


def normalize_handle(raw: str) -> str:
    """Phone numbers to E.164 (US default), emails lowercased, anything else as-is."""
    value = (raw or "").strip()
    if "@" in value:
        return value.lower()
    digits = "".join(ch for ch in value if ch.isdigit())
    if value.startswith("+") and len(digits) >= 8:
        return "+" + digits
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return value


class Ledger:
    def __init__(self, path: Optional[os.PathLike | str] = None):
        self.path = Path(path) if path else default_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(self.path, check_same_thread=False, timeout=15)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(SCHEMA)
            self._db.commit()

    def _run(self, sql: str, args: Iterable[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            cur = self._db.execute(sql, tuple(args))
            self._db.commit()
            return cur

    def _all(self, sql: str, args: Iterable[Any] = ()) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self._db.execute(sql, tuple(args)).fetchall()]

    def _one(self, sql: str, args: Iterable[Any] = ()) -> Optional[dict]:
        rows = self._all(sql, args)
        return rows[0] if rows else None

    # -- people ---------------------------------------------------------------

    def touch_person(self, handle: str, *, chat_id: str = "", platform: str = "") -> dict:
        """Make sure a person exists and remember where their agent reaches them."""
        handle = normalize_handle(handle)
        self._run("INSERT OR IGNORE INTO people (handle, created_at) VALUES (?, ?)", (handle, time.time()))
        if chat_id:
            self._run("UPDATE people SET chat_id = ?, platform = ? WHERE handle = ?", (chat_id, platform, handle))
        return self.person(handle)

    def person(self, handle: str) -> Optional[dict]:
        return self._one("SELECT * FROM people WHERE handle = ?", (normalize_handle(handle),))

    def update_person(self, handle: str, **fields: Any) -> dict:
        handle = normalize_handle(handle)
        self.touch_person(handle)
        for key, value in fields.items():
            if key not in PROFILE_FIELDS + ("bank_customer_id", "bank_account_id", "last_image", "last_image_at"):
                raise KeyError(key)
            self._run(f"UPDATE people SET {key} = ? WHERE handle = ?", (value, handle))
        return self.person(handle)

    def display_name(self, handle: str) -> str:
        person = self.person(handle)
        if person and person["name"]:
            return person["name"]
        return f"…{handle[-4:]}" if len(handle) > 4 else handle

    def add_contact(self, owner: str, nickname: str, handle: str) -> None:
        self._run(
            "INSERT OR REPLACE INTO contacts (owner, nickname, handle) VALUES (?, ?, ?)",
            (normalize_handle(owner), nickname.strip().lower(), normalize_handle(handle)),
        )

    def resolve(self, owner: str, who: str) -> list[str]:
        """Handles a name could mean for this owner: their nicknames first, then registered names."""
        who = (who or "").strip()
        as_handle = normalize_handle(who)
        if as_handle.startswith("+") or "@" in as_handle:
            return [as_handle]
        key = who.lower()
        nick = self._one("SELECT handle FROM contacts WHERE owner = ? AND nickname = ?", (normalize_handle(owner), key))
        if nick:
            return [nick["handle"]]
        people = self._all("SELECT handle, name FROM people WHERE name IS NOT NULL")
        exact = [p["handle"] for p in people if p["name"].lower() == key]
        if exact:
            return exact
        return [p["handle"] for p in people if p["name"].lower().split()[0] == key.split()[0]]

    # -- splits ---------------------------------------------------------------

    def create_split(self, *, payer: str, merchant: str, mode: str, items: list[tuple[str, int, int]],
                     members: list[str], charges: dict[str, int], total_cents: int,
                     unclaimed: str = "even", receipt_path: Optional[str] = None) -> str:
        with self._lock:
            while True:
                split_id = "TAB-" + "".join(secrets.choice(_ALPHABET) for _ in range(4))
                if not self.split(split_id):
                    break
            self._run(
                "INSERT INTO splits (id, payer, merchant, mode, tax_cents, tip_cents, fees_cents, discount_cents,"
                " total_cents, unclaimed, receipt_path, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (split_id, payer, merchant, mode, charges.get("tax_cents", 0), charges.get("tip_cents", 0),
                 charges.get("fees_cents", 0), charges.get("discount_cents", 0), total_cents, unclaimed,
                 receipt_path, time.time()),
            )
            for label, qty, cents in items:
                self._run("INSERT INTO items (split_id, label, qty, total_cents) VALUES (?,?,?,?)",
                          (split_id, label, qty, cents))
            for handle in members:
                self._run(
                    "INSERT INTO members (split_id, handle, paid) VALUES (?,?,?)",
                    (split_id, handle, "payer" if handle == payer else "unpaid"),
                )
        return split_id

    def split(self, split_id: str) -> Optional[dict]:
        return self._one("SELECT * FROM splits WHERE id = ?", ((split_id or "").strip().upper(),))

    def update_split(self, split_id: str, **fields: Any) -> None:
        for key, value in fields.items():
            self._run(f"UPDATE splits SET {key} = ? WHERE id = ?", (value, split_id))

    def items(self, split_id: str) -> list[dict]:
        return self._all("SELECT * FROM items WHERE split_id = ? ORDER BY id", (split_id,))

    def members(self, split_id: str) -> list[dict]:
        # Payer first, then in the order they were invited.
        return self._all(
            "SELECT * FROM members WHERE split_id = ? ORDER BY (paid = 'payer') DESC, rowid", (split_id,))

    def member(self, split_id: str, handle: str) -> Optional[dict]:
        return self._one("SELECT * FROM members WHERE split_id = ? AND handle = ?", (split_id, handle))

    def update_member(self, split_id: str, handle: str, **fields: Any) -> None:
        for key, value in fields.items():
            if key == "breakdown" and not isinstance(value, str):
                value = json.dumps(value)
            self._run(f"UPDATE members SET {key} = ? WHERE split_id = ? AND handle = ?", (value, split_id, handle))

    def claims(self, split_id: str) -> list[dict]:
        return self._all("SELECT * FROM claims WHERE split_id = ?", (split_id,))

    def set_claims(self, split_id: str, handle: str, claims: list[tuple[int, Optional[float]]]) -> None:
        """Replace everything this person claimed on the split."""
        with self._lock:
            self._run("DELETE FROM claims WHERE split_id = ? AND handle = ?", (split_id, handle))
            for item_id, portion in claims:
                self._run("INSERT OR REPLACE INTO claims (split_id, item_id, handle, portion) VALUES (?,?,?,?)",
                          (split_id, item_id, handle, portion))
            self.update_member(split_id, handle, state="claimed")

    def splits_for(self, handle: str, *, open_only: bool = True) -> list[dict]:
        """Splits this person is part of, newest first."""
        sql = ("SELECT s.* FROM splits s JOIN members m ON m.split_id = s.id WHERE m.handle = ?"
               + (" AND s.status IN ('collecting', 'final')" if open_only else "") + " ORDER BY s.created_at DESC")
        return self._all(sql, (handle,))

    # -- room and outbox ------------------------------------------------------

    def post(self, split_id: str, speaker: str, kind: str, body: str, media: Optional[str] = None) -> int:
        return self._run(
            "INSERT INTO room (split_id, ts, speaker, kind, body, media) VALUES (?,?,?,?,?,?)",
            (split_id, time.time(), speaker, kind, body, media),
        ).lastrowid

    def transcript(self, split_id: Optional[str] = None, after_id: int = 0) -> list[dict]:
        if split_id:
            return self._all("SELECT * FROM room WHERE split_id = ? AND id > ? ORDER BY id", (split_id, after_id))
        return self._all("SELECT * FROM room WHERE id > ? ORDER BY id", (after_id,))

    def log_outbound(self, to_handle: str, body: str, *, media: Optional[str] = None,
                     split_id: Optional[str] = None, delivered: bool = False, error: Optional[str] = None) -> int:
        return self._run(
            "INSERT INTO outbox (ts, to_handle, body, media, split_id, delivered, error) VALUES (?,?,?,?,?,?,?)",
            (time.time(), to_handle, body, media, split_id, int(delivered), error),
        ).lastrowid

    def outbox(self, to_handle: Optional[str] = None) -> list[dict]:
        if to_handle:
            return self._all("SELECT * FROM outbox WHERE to_handle = ? ORDER BY id", (to_handle,))
        return self._all("SELECT * FROM outbox ORDER BY id")

    # -- small persistent values (merchant ids, simulated balances) -------------

    def get(self, key: str, default: Any = None) -> Any:
        row = self._one("SELECT value FROM kv WHERE key = ?", (key,))
        return json.loads(row["value"]) if row else default

    def put(self, key: str, value: Any) -> None:
        self._run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (key, json.dumps(value)))

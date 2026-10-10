"""Capital One Nessie: every person gets a mock checking account.

A reimbursement moves money member -> payer (a transfer out of one account and
a matching deposit into the other). With no NESSIE_API_KEY the same interface
runs against balances kept in the ledger, so the flow works offline.

This Nessie deployment stores amounts as integers and never updates
`account.balance`, so every amount is CENTS and a balance is derived from the
account's own transaction lists. (Carried over from the original TypeScript bot,
app/spectrum-bot/src/tools/bank.ts.)
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Optional

from .ledger import Ledger

BASE = "https://api.nessieisreal.com"
STARTING_BALANCE_CENTS = 500_00
ADDRESS = {"street_number": "201", "street_name": "S Columbia St", "city": "Chapel Hill", "state": "NC", "zip": "27599"}


class BankError(Exception):
    pass


def _api_key() -> str:
    return os.environ.get("NESSIE_API_KEY", "").strip()


def enabled() -> bool:
    return bool(_api_key())


def _nessie(method: str, path: str, body: Optional[dict] = None) -> Any:
    url = f"{BASE}{path}{'&' if '?' in path else '?'}key={_api_key()}"
    req = urllib.request.Request(
        url, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"content-type": "application/json", "accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:200]
        raise BankError(f"Nessie {method} {path} {exc.code}: {detail}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise BankError(f"Nessie unreachable: {exc}") from None
    return data.get("objectCreated", data) if isinstance(data, dict) else data


def _rows(path: str) -> list[dict]:
    # Nessie answers 404 (not []) for an account with no transactions of a kind.
    try:
        rows = _nessie("GET", path)
    except BankError as exc:
        if " 404" in str(exc):
            return []
        raise
    return rows if isinstance(rows, list) else []


def _today() -> str:
    return time.strftime("%Y-%m-%d")


class Bank:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger

    # -- accounts -------------------------------------------------------------

    def account_for(self, handle: str) -> str:
        """This person's checking account id, opened with a starting balance on first use."""
        person = self.ledger.touch_person(handle)
        if person["bank_account_id"]:
            return person["bank_account_id"]
        name = re.sub(r"[^\w ]", "", self.ledger.display_name(handle)).strip() or "Friend"
        first, _, last = name.partition(" ")
        if enabled():
            customer = _nessie("POST", "/customers", {"first_name": first, "last_name": last or "GroupCart", "address": ADDRESS})
            account = _nessie("POST", f"/customers/{customer['_id']}/accounts",
                              {"type": "Checking", "nickname": f"{name} checking", "rewards": 0, "balance": STARTING_BALANCE_CENTS})
            customer_id, account_id = customer["_id"], account["_id"]
        else:
            customer_id, account_id = f"sim-c-{uuid.uuid4().hex[:8]}", f"sim-a-{uuid.uuid4().hex[:8]}"
            self.ledger.put(f"sim:{account_id}", {"balance": STARTING_BALANCE_CENTS, "activity": []})
        self.ledger.update_person(handle, bank_customer_id=customer_id, bank_account_id=account_id)
        return account_id

    def _sim(self, account_id: str) -> dict:
        return self.ledger.get(f"sim:{account_id}", {"balance": 0, "activity": []})

    def _sim_record(self, account_id: str, kind: str, signed_cents: int, description: str) -> str:
        state = self._sim(account_id)
        ref = f"sim-{uuid.uuid4().hex[:10]}"
        state["balance"] += signed_cents
        state["activity"].append({"kind": kind, "amount_cents": signed_cents, "description": description, "date": _today(), "id": ref})
        self.ledger.put(f"sim:{account_id}", state)
        return ref

    def activity(self, account_id: str) -> list[dict]:
        """Signed entries, oldest first: money in is positive, money out negative."""
        if not account_id.startswith("sim-") and enabled():
            out = []
            for kind, sign, date_key in (("deposit", 1, "transaction_date"), ("withdrawal", -1, "transaction_date"),
                                         ("transfer", -1, "transaction_date"), ("purchase", -1, "purchase_date")):
                for row in _rows(f"/accounts/{account_id}/{kind}s"):
                    if row.get("status") == "cancelled":
                        continue
                    out.append({"kind": kind, "amount_cents": sign * int(row.get("amount", 0)),
                                "description": row.get("description") or "", "date": row.get(date_key) or "", "id": row.get("_id")})
            return sorted(out, key=lambda r: r["date"])
        return self._sim(account_id)["activity"]

    def balance_cents(self, account_id: str) -> int:
        if not account_id.startswith("sim-") and enabled():
            opening = int(_nessie("GET", f"/accounts/{account_id}").get("balance", 0))
            return opening + sum(r["amount_cents"] for r in self.activity(account_id))
        return self._sim(account_id)["balance"]

    # -- money movement -------------------------------------------------------

    def transfer(self, from_account: str, to_account: str, cents: int, description: str) -> str:
        if cents <= 0:
            raise BankError("transfer amount must be positive")
        balance = self.balance_cents(from_account)
        if balance < cents:
            raise BankError(f"balance ${balance / 100:.2f} is short of ${cents / 100:.2f}")
        if not from_account.startswith("sim-") and enabled():
            out = _nessie("POST", f"/accounts/{from_account}/transfers",
                          {"transaction_date": _today(), "status": "completed", "amount": cents, "description": description})
            _nessie("POST", f"/accounts/{to_account}/deposits",
                    {"medium": "balance", "transaction_date": _today(), "status": "completed", "amount": cents,
                     "description": f"{description} (transfer {out['_id']})"})
            return out["_id"]
        ref = self._sim_record(from_account, "transfer", -cents, description)
        self._sim_record(to_account, "deposit", cents, f"{description} (transfer {ref})")
        return ref

    def purchase(self, account_id: str, merchant: str, cents: int, description: str) -> str:
        """Record a card purchase, e.g. the dinner the payer covered."""
        if not account_id.startswith("sim-") and enabled():
            merchants = self.ledger.get("nessie:merchants", {})
            key = merchant.strip().lower()
            if key not in merchants:
                merchants[key] = _nessie("POST", "/merchants", {"name": merchant.strip(), "category": "food"})["_id"]
                self.ledger.put("nessie:merchants", merchants)
            made = _nessie("POST", f"/accounts/{account_id}/purchases",
                           {"merchant_id": merchants[key], "medium": "balance", "purchase_date": _today(),
                            "status": "completed", "amount": cents, "description": description})
            return made["_id"]
        return self._sim_record(account_id, "purchase", -cents, description)

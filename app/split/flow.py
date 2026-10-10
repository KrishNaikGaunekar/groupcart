"""The split itself, start to finish.

    open      payer's agent posts the receipt to the agents' room; every other
              member's agent asks its own human what they had
    claim     a member's agent reports back to the room; the last claim
              finalizes the split automatically
    finalize  shares are computed and each agent tells its human what they owe
    pay       a member settles up (Capital One transfer, or says they paid)

Everything an agent says to another agent goes to the room; everything an agent
says to a human goes through the notifier. Nothing here imports the runtime.
"""
from __future__ import annotations

import difflib
import json
import os
import time
from typing import Any, Optional
from urllib.parse import quote

from .bank import Bank, BankError
from .ledger import Ledger
from .money import fmt, to_cents
from .notify import Notifier
from .splitter import Charges, Claim, Item, compute, portion_label

RECEIPT_FRESH_SECONDS = 3600
EXTERNAL_METHODS = ("venmo", "zelle", "paypal", "cashapp", "cash")


class SplitError(Exception):
    """A problem the agent can explain to its human and usually fix by asking them something."""


def _norm(text: str) -> str:
    return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in text).split())


def pay_links(payer: dict, cents: int, note: str) -> list[str]:
    amount = f"{cents / 100:.2f}"
    links = []
    if payer.get("venmo"):
        links.append(f"Venmo: https://venmo.com/{payer['venmo'].lstrip('@')}?txn=pay&amount={amount}&note={quote(note)}")
    if payer.get("zelle"):
        links.append(f"Zelle: {payer['zelle']}")
    if payer.get("paypal"):
        links.append(f"PayPal: https://paypal.me/{payer['paypal'].lstrip('@')}/{amount}")
    if payer.get("cashapp"):
        links.append(f"Cash App: https://cash.app/${payer['cashapp'].lstrip('$')}/{amount}")
    return links


class Flow:
    def __init__(self, ledger: Ledger, notifier: Notifier, bank: Optional[Bank] = None):
        self.ledger = ledger
        self.notifier = notifier
        self.bank = bank or Bank(ledger)

    # -- helpers --------------------------------------------------------------

    def _name(self, handle: str) -> str:
        return self.ledger.display_name(handle)

    def _item_list(self, split_id: str) -> str:
        lines = []
        for n, item in enumerate(self.ledger.items(split_id), 1):
            qty = f"{item['qty']}× " if item["qty"] > 1 else ""
            lines.append(f"{n}. {qty}{item['label']} {fmt(item['total_cents'])}")
        return "\n".join(lines)

    def _pick_split(self, handle: str, split_id: Optional[str], *, want: str) -> dict:
        """The split a member means. `want` narrows it when they did not name one."""
        if split_id:
            split = self.ledger.split(split_id)
            if not split or not self.ledger.member(split["id"], handle):
                raise SplitError(f"no split {split_id} that {self._name(handle)} is part of")
            return split
        candidates = []
        for split in self.ledger.splits_for(handle):
            member = self.ledger.member(split["id"], handle)
            if want == "claim" and split["status"] == "collecting" and member["state"] == "asked":
                candidates.append(split)
            elif want == "pay" and split["status"] == "final" and member["paid"] == "unpaid":
                candidates.append(split)
            elif want == "own" and split["payer"] == handle:
                candidates.append(split)
            elif want == "any":
                candidates.append(split)
        if not candidates:
            raise SplitError({"claim": "no split is waiting on what they had", "pay": "nothing unpaid right now",
                              "own": "they have not started a split", "any": "no open splits"}[want])
        if len(candidates) > 1 and want != "any":
            options = ", ".join(f"{s['id']} ({s['merchant']})" for s in candidates)
            raise SplitError(f"more than one split matches — pass split_id. Options: {options}")
        return candidates[0]

    def _match_item(self, items: list[dict], ref: Any) -> dict:
        """An item by its number in the list or by (fuzzy) name."""
        text = str(ref).strip().lstrip("#")
        if text.isdigit() and 1 <= int(text) <= len(items):
            return items[int(text) - 1]
        want = _norm(text)
        labels = {_norm(i["label"]): i for i in items}
        if want in labels:
            return labels[want]
        partial = [i for label, i in labels.items() if want and (want in label or label in want)]
        if len(partial) == 1:
            return partial[0]
        close = difflib.get_close_matches(want, list(labels), n=1, cutoff=0.6)
        if close and len(partial) <= 1:
            return labels[close[0]]
        hint = " or ".join(f"#{items.index(i) + 1} {i['label']}" for i in partial) if partial else "none of the items"
        raise SplitError(f"'{ref}' matches {hint}. Use the item number.")

    def _to_claims(self, split_id: str, picks: list[dict]) -> list[tuple[int, Optional[float]]]:
        items = self.ledger.items(split_id)
        out: dict[int, Optional[float]] = {}
        for pick in picks:
            item = self._match_item(items, pick.get("item", ""))
            portion = pick.get("portion")
            if pick.get("count") and item["qty"] > 1:
                portion = min(float(pick["count"]) / item["qty"], 1.0)
            if portion is not None:
                portion = float(portion)
                if not 0 < portion <= 1:
                    raise SplitError(f"portion for '{item['label']}' must be between 0 and 1")
            out[item["id"]] = portion
        return list(out.items())

    def _describe_claims(self, split_id: str, handle: str) -> str:
        items = {i["id"]: i for i in self.ledger.items(split_id)}
        parts = []
        for claim in self.ledger.claims(split_id):
            if claim["handle"] != handle:
                continue
            item = items[claim["item_id"]]
            parts.append(item["label"] if claim["portion"] is None
                         else portion_label(item["label"], claim["portion"], item["qty"]))
        return ", ".join(parts) or "nothing"

    # -- open -----------------------------------------------------------------

    def open(self, payer: str, *, merchant: str, items: list[dict], participants: list[str],
             payer_items: Optional[list[dict]] = None, tax: Any = 0, tip: Any = 0, fees: Any = 0,
             discount: Any = 0, total: Any = None, mode: str = "settle", unclaimed: str = "even",
             receipt_path: Optional[str] = None) -> dict:
        if not self.ledger.person(payer) or not self.ledger.person(payer)["name"]:
            raise SplitError("the payer has no name on file yet — ask what to call them and save it with profile_set first")
        if not items:
            raise SplitError("no line items — read them off the receipt first")
        if mode not in ("settle", "prepay") or unclaimed not in ("even", "payer"):
            raise SplitError("mode must be settle or prepay; unclaimed must be even or payer")

        members, unknown, ambiguous = [payer], [], []
        for who in participants:
            found = [h for h in self.ledger.resolve(payer, who) if h != payer]
            if len(found) == 1:
                if found[0] not in members:
                    members.append(found[0])
            elif not found:
                unknown.append(who)
            else:
                ambiguous.append(f"{who} ({', '.join(self._name(h) + ' ' + h[-4:] for h in found)})")
        if unknown or ambiguous:
            raise SplitError(
                "could not place everyone. "
                + (f"Unknown: {', '.join(unknown)} — ask for their phone number and save it with contact_add"
                   " (they also need to have texted their own agent once). " if unknown else "")
                + (f"Ambiguous: {'; '.join(ambiguous)} — ask which one and use the phone number." if ambiguous else ""))
        if len(members) < 2:
            raise SplitError("a split needs at least one other person")

        rows = []
        for item in items:
            cents = to_cents(item.get("total", item.get("price")))
            qty = max(int(item.get("qty") or 1), 1)
            if cents:
                rows.append((str(item.get("name") or "item").strip(), qty, cents))
        charges = {"tax_cents": to_cents(tax), "tip_cents": to_cents(tip), "fees_cents": to_cents(fees),
                   "discount_cents": abs(to_cents(discount))}
        computed = (sum(c for _, _, c in rows) + charges["tax_cents"] + charges["tip_cents"]
                    + charges["fees_cents"] - charges["discount_cents"])
        total_cents = to_cents(total) if total not in (None, "") else computed
        adjustment = total_cents - computed
        # The group has to cover what was actually charged, so a receipt whose
        # lines do not add up is squared by a visible adjustment, not ignored.
        charges["fees_cents"] += adjustment

        if not receipt_path:
            person = self.ledger.person(payer)
            if person["last_image"] and time.time() - (person["last_image_at"] or 0) < RECEIPT_FRESH_SECONDS:
                receipt_path = person["last_image"]
        if receipt_path and not os.path.isfile(receipt_path):
            receipt_path = None

        split_id = self.ledger.create_split(payer=payer, merchant=merchant.strip() or "the bill", mode=mode, items=rows,
                                            members=members, charges=charges, total_cents=total_cents,
                                            unclaimed=unclaimed, receipt_path=receipt_path)
        self.ledger.set_claims(split_id, payer, self._to_claims(split_id, payer_items or []))

        payer_name, listing = self._name(payer), self._item_list(split_id)
        extras = " · ".join(f"{label} {fmt(charges[key])}" for label, key in
                            (("tax", "tax_cents"), ("tip", "tip_cents"), ("fees", "fees_cents")) if charges[key])
        verb = "is putting together" if mode == "prepay" else "paid"
        self.ledger.post(
            split_id, payer, "open",
            f"🧾 {merchant} — {fmt(total_cents)}. {payer_name} {verb} it, so everyone here "
            f"{'chips in before it is ordered' if mode == 'prepay' else 'owes ' + payer_name}.\n{listing}"
            + (f"\n{extras}" if extras else "")
            + f"\n{payer_name} had: {self._describe_claims(split_id, payer)}.\nAgents: ask your people what they had.",
            media=receipt_path)

        reached, unreached = [], []
        for handle in members[1:]:
            lead = (f"{payer_name} is ordering from {merchant} ({fmt(total_cents)}) and wants to split it before paying."
                    if mode == "prepay" else f"{payer_name} covered {merchant} ({fmt(total_cents)}) and added you to the split.")
            ok = self.notifier.tell(
                handle, f"hey {self._name(handle)}! {lead}\nwhat did you have?\n{listing}\n"
                        "text me back and i'll work out your share, tax and tip included.",
                media=receipt_path, split_id=split_id)
            (reached if ok else unreached).append(self._name(handle))

        bank_note = None
        if mode == "settle":
            try:
                ref = self.bank.purchase(self.bank.account_for(payer), merchant, total_cents, f"{merchant} ({split_id})")
                self.ledger.update_split(split_id, bank_purchase_id=ref)
            except BankError as exc:
                bank_note = f"could not record the purchase on the payer's account: {exc}"

        return {"split_id": split_id, "merchant": merchant, "total": fmt(total_cents), "mode": mode,
                "members": [self._name(h) for h in members], "asked": reached, "could_not_reach": unreached,
                "receipt_attached": bool(receipt_path),
                "adjustment": fmt(adjustment) if adjustment else None, "bank_note": bank_note,
                "next": "Each person's agent is asking them what they had. Tell the payer it is in motion; "
                        "the split finalizes itself when the last person answers."}

    # -- claim ----------------------------------------------------------------

    def claim(self, handle: str, *, items: Optional[list[dict]] = None, nothing: bool = False,
              split_id: Optional[str] = None) -> dict:
        split = self._pick_split(handle, split_id, want="claim" if not split_id else "any")
        if split["status"] not in ("collecting", "final"):
            raise SplitError(f"{split['id']} is {split['status']}")
        if any(m["paid"] == "paid" for m in self.ledger.members(split["id"])):
            raise SplitError("people have already paid on this split — the payer has to cancel and redo it to change items")
        if not items and not nothing:
            raise SplitError("pass the items they had, or nothing=true")
        self.ledger.set_claims(split["id"], handle, self._to_claims(split["id"], items or []))
        said = self._describe_claims(split["id"], handle)
        self.ledger.post(split["id"], handle, "claim", f"{self._name(handle)} had: {said}.")

        waiting = [self._name(m["handle"]) for m in self.ledger.members(split["id"]) if m["state"] == "asked"]
        out: dict[str, Any] = {"split_id": split["id"], "recorded": said, "still_waiting_on": waiting}
        if not waiting:
            out["finalized"] = self.finalize(split["payer"], split_id=split["id"])
            mine = self.ledger.member(split["id"], handle)
            out["you_owe"] = fmt(mine["owes_cents"]) if mine["paid"] == "unpaid" else None
            out["next"] = "Everyone has answered and the shares went out. They already got the amount by text; do not repeat the breakdown."
        else:
            out["next"] = "Tell them it is noted and that their share comes once the others answer."
        return out

    # -- finalize -------------------------------------------------------------

    def finalize(self, handle: str, *, split_id: Optional[str] = None, unclaimed: Optional[str] = None,
                 force: bool = False) -> dict:
        split = self._pick_split(handle, split_id, want="own")
        if split["payer"] != handle:
            raise SplitError(f"only {self._name(split['payer'])}'s agent can finalize this split")
        if split["status"] not in ("collecting", "final"):
            raise SplitError(f"{split['id']} is {split['status']}")
        members = self.ledger.members(split["id"])
        waiting = [self._name(m["handle"]) for m in members if m["state"] == "asked"]
        if waiting and not force:
            raise SplitError(f"still waiting on {', '.join(waiting)}. Pass force=true to settle without them "
                             "(they will only carry their part of whatever nobody claimed).")
        policy = unclaimed or split["unclaimed"]
        items = [Item(i["id"], i["label"], i["total_cents"], i["qty"]) for i in self.ledger.items(split["id"])]
        claims = [Claim(c["item_id"], c["handle"], c["portion"]) for c in self.ledger.claims(split["id"])]
        charges = Charges(split["tax_cents"], split["tip_cents"], split["fees_cents"], split["discount_cents"])
        result = compute(items, [m["handle"] for m in members], claims, charges, payer=split["payer"], unclaimed=policy)

        payer, payer_name, merchant = self.ledger.person(split["payer"]), self._name(split["payer"]), split["merchant"]
        summary = []
        for member in members:
            share = result.shares[member["handle"]]
            self.ledger.update_member(split["id"], member["handle"], owes_cents=share.total_cents, breakdown={
                "lines": share.lines, "tax": share.tax_cents, "tip": share.tip_cents,
                "fees": share.fees_cents, "discount": share.discount_cents})
            is_payer = member["handle"] == split["payer"]
            who = self._name(member["handle"])
            summary.append(f"{who}'s own share is {fmt(share.total_cents)}" if is_payer else f"{who} owes {fmt(share.total_cents)}")
            if is_payer or share.total_cents <= 0:
                if not is_payer:
                    self.ledger.update_member(split["id"], member["handle"], paid="paid", paid_via="nothing owed", paid_at=time.time())
                continue
            lines = [f"· {label} {fmt(cents)}" for label, cents in share.lines]
            extras = " · ".join(f"{label} {fmt(value)}" for label, value in
                                (("tax", share.tax_cents), ("tip", share.tip_cents), ("fees", share.fees_cents),
                                 ("discount", -share.discount_cents)) if value)
            links = pay_links(payer, share.total_cents, f"{merchant} {split['id']}")
            ask = (f"pay your share so {payer_name} can place the order" if split["mode"] == "prepay"
                   else f"you owe {payer_name}")
            self.notifier.tell(
                member["handle"],
                f"{merchant}: {ask} {fmt(share.total_cents)}\n" + "\n".join(lines) + (f"\n{extras}" if extras else "")
                + ("\n" + "\n".join(links) if links else "")
                + '\nor reply "pay" and i\'ll send it from your Capital One account.',
                split_id=split["id"])

        self.ledger.update_split(split["id"], status="final", unclaimed=policy, finalized_at=time.time())
        unclaimed_note = ", ".join(f"{label} {fmt(cents)}" for label, cents in result.unclaimed)
        self.ledger.post(split["id"], split["payer"], "final",
                         "Shares are in: " + "; ".join(summary) + "."
                         + (f" Nobody claimed {unclaimed_note} — "
                            f"{'split evenly' if policy == 'even' else payer_name + ' absorbs it'}." if unclaimed_note else ""))
        self.notifier.tell(split["payer"],
                           f"{merchant} is split ✅\n" + "\n".join(summary)
                           + (f"\nnobody claimed: {unclaimed_note}" if unclaimed_note else "")
                           + "\ni'll tell you as people pay.", split_id=split["id"])
        self._settle_if_done(split["id"])
        return {"split_id": split["id"], "shares": summary, "unclaimed": unclaimed_note or None,
                "total": fmt(result.total_cents)}

    # -- pay ------------------------------------------------------------------

    def pay(self, handle: str, *, method: str = "capital_one", split_id: Optional[str] = None) -> dict:
        split = self._pick_split(handle, split_id, want="pay" if not split_id else "any")
        member = self.ledger.member(split["id"], handle)
        if split["status"] != "final" or member["owes_cents"] is None:
            raise SplitError("the shares are not final yet")
        if member["paid"] != "unpaid":
            raise SplitError("that share is already settled")
        method = (method or "capital_one").lower().replace(" ", "_")
        cents, payer_name = member["owes_cents"], self._name(split["payer"])
        ref = None
        if method == "capital_one":
            try:
                ref = self.bank.transfer(self.bank.account_for(handle), self.bank.account_for(split["payer"]), cents,
                                         f"{split['merchant']} share ({split['id']})")
            except BankError as exc:
                raise SplitError(f"Capital One transfer failed: {exc}") from None
        elif method not in EXTERNAL_METHODS:
            raise SplitError(f"method must be capital_one or one of {', '.join(EXTERNAL_METHODS)}")
        self.ledger.update_member(split["id"], handle, paid="paid", paid_via=method, paid_ref=ref, paid_at=time.time())
        how = "from their Capital One account" if method == "capital_one" else f"by {method} (their word)"
        self.ledger.post(split["id"], handle, "paid", f"{self._name(handle)} paid {fmt(cents)} {how}.")
        self.notifier.tell(split["payer"], f"💸 {self._name(handle)} paid you {fmt(cents)} for {split['merchant']} {how}.",
                           split_id=split["id"])
        settled = self._settle_if_done(split["id"])
        out = {"split_id": split["id"], "paid": fmt(cents), "to": payer_name, "method": method, "settled": settled}
        if method == "capital_one":
            out["balance_after"] = fmt(self.bank.balance_cents(self.bank.account_for(handle)))
        return out

    def _settle_if_done(self, split_id: str) -> bool:
        split = self.ledger.split(split_id)
        if split["status"] != "final" or any(m["paid"] == "unpaid" for m in self.ledger.members(split_id)):
            return False
        self.ledger.update_split(split_id, status="settled")
        self.ledger.post(split_id, split["payer"], "settled", f"All square on {split['merchant']}.")
        self.notifier.tell(split["payer"], f"everyone's paid up for {split['merchant']} 🎉", split_id=split_id)
        return True

    # -- status / cancel ------------------------------------------------------

    def status(self, handle: str, split_id: Optional[str] = None) -> dict:
        if split_id:
            splits = [self._pick_split(handle, split_id, want="any")]
        else:
            splits = self.ledger.splits_for(handle)[:5]
        out = []
        for split in splits:
            members = self.ledger.members(split["id"])
            unpaid = [m for m in members if m["paid"] == "unpaid"]
            out.append({
                "split_id": split["id"], "merchant": split["merchant"], "total": fmt(split["total_cents"]),
                "status": split["status"], "mode": split["mode"], "payer": self._name(split["payer"]),
                "items": self._item_list(split["id"]),
                "people": [{"name": self._name(m["handle"]), "answered": m["state"] == "claimed",
                            "had": self._describe_claims(split["id"], m["handle"]),
                            "owes": fmt(m["owes_cents"]) if m["owes_cents"] is not None else None,
                            "paid": m["paid"]} for m in members],
                # What a checkout gate needs to know before a prepay order is placed.
                "collected": split["status"] == "settled" or (split["status"] == "final" and not unpaid),
                "room": [f"{self._name(r['speaker'])}'s agent: {r['body']}" for r in self.ledger.transcript(split["id"])][-8:],
            })
        return {"splits": out} if out else {"splits": [], "note": "no open splits"}

    def cancel(self, handle: str, split_id: Optional[str] = None) -> dict:
        split = self._pick_split(handle, split_id, want="own")
        if split["payer"] != handle:
            raise SplitError(f"only {self._name(split['payer'])}'s agent can cancel this split")
        paid = [self._name(m["handle"]) for m in self.ledger.members(split["id"]) if m["paid"] == "paid" and m["paid_via"] != "nothing owed"]
        self.ledger.update_split(split["id"], status="cancelled")
        self.ledger.post(split["id"], handle, "cancelled", f"{self._name(handle)} cancelled the {split['merchant']} split.")
        for member in self.ledger.members(split["id"]):
            if member["handle"] != handle:
                self.notifier.tell(member["handle"], f"{self._name(handle)} cancelled the {split['merchant']} split — ignore the earlier ask.",
                                   split_id=split["id"])
        return {"split_id": split["id"], "cancelled": True,
                "already_paid": paid or None, "note": "money already sent is NOT refunded automatically" if paid else None}

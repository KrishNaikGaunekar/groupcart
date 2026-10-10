"""Who owes what. Pure functions over cents — no I/O, no runtime imports.

An item's cost goes to the people who claimed it. A claim either states a
portion ("I had half", 0.5) or leaves it open ("I had the ramen"); open claims
share whatever the stated portions leave. Anything nobody claimed is the
unclaimed pool, split evenly or absorbed by the payer. Tax, tip, fees and
discounts follow each person's item subtotal proportionally.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional, Sequence

from .money import allocate

UNCLAIMED = "__unclaimed__"


@dataclass(frozen=True)
class Item:
    id: int
    label: str
    total_cents: int
    qty: int = 1


@dataclass(frozen=True)
class Claim:
    item_id: int
    handle: str
    portion: Optional[float] = None  # None = an equal part of whatever is left


@dataclass(frozen=True)
class Charges:
    tax_cents: int = 0
    tip_cents: int = 0
    fees_cents: int = 0
    discount_cents: int = 0


@dataclass
class Share:
    handle: str
    lines: list[tuple[str, int]] = field(default_factory=list)  # (label, cents)
    items_cents: int = 0
    tax_cents: int = 0
    tip_cents: int = 0
    fees_cents: int = 0
    discount_cents: int = 0

    @property
    def total_cents(self) -> int:
        return self.items_cents + self.tax_cents + self.tip_cents + self.fees_cents - self.discount_cents


@dataclass
class Result:
    shares: dict[str, Share]
    unclaimed: list[tuple[str, int]]  # (label, cents) nobody claimed

    @property
    def total_cents(self) -> int:
        return sum(s.total_cents for s in self.shares.values())


def _item_fractions(claims: Sequence[Claim]) -> dict[str, Fraction]:
    """Fraction of one item per claimant; UNCLAIMED holds what nobody took."""
    stated: dict[str, Fraction] = {}
    open_claimants: list[str] = []
    for c in claims:
        if c.portion is None:
            if c.handle not in open_claimants and c.handle not in stated:
                open_claimants.append(c.handle)
        else:
            portion = min(max(Fraction(c.portion).limit_denominator(1000), Fraction(0)), Fraction(1))
            stated[c.handle] = stated.get(c.handle, Fraction(0)) + portion
    stated = {h: f for h, f in stated.items() if f > 0}
    taken = sum(stated.values(), Fraction(0))

    if open_claimants and taken >= 1:
        # The stated portions already cover the item, yet someone else claimed it
        # too: treat everything as weights so nobody is silently dropped.
        weights = {**stated, **{h: Fraction(1) for h in open_claimants}}
        total = sum(weights.values())
        return {h: w / total for h, w in weights.items()}
    if taken > 1:
        return {h: f / taken for h, f in stated.items()}

    out = dict(stated)
    left = 1 - taken
    if open_claimants:
        for h in open_claimants:
            out[h] = left / len(open_claimants)
    elif left > 0:
        out[UNCLAIMED] = left
    return out


def portion_label(label: str, fraction: Fraction, qty: int = 1) -> str:
    """"Edamame", "½ Edamame", or "1 of 2 Sapporo" for a multi-quantity line."""
    fraction = Fraction(fraction).limit_denominator(1000)
    if qty > 1:
        units = fraction * qty
        if fraction >= 1:
            return f"{qty} {label}"
        if units.denominator == 1:
            return f"{units.numerator} of {qty} {label}"
        label = f"{qty} {label}"
    if fraction >= 1:
        return label
    nice = {Fraction(1, 2): "½", Fraction(1, 3): "⅓", Fraction(2, 3): "⅔", Fraction(1, 4): "¼", Fraction(3, 4): "¾"}
    return f"{nice.get(fraction, f'{float(fraction):.0%}')} {label}"


def compute(
    items: Sequence[Item],
    members: Sequence[str],
    claims: Sequence[Claim],
    charges: Charges = Charges(),
    *,
    payer: Optional[str] = None,
    unclaimed: str = "even",
) -> Result:
    """Shares for every member. `unclaimed` is "even" or "payer"."""
    if not members:
        raise ValueError("a split needs at least one member")
    shares = {h: Share(h) for h in members}
    pool: list[tuple[str, int]] = []

    for item in items:
        mine = [c for c in claims if c.item_id == item.id and c.handle in shares]
        fractions = _item_fractions(mine) if mine else {UNCLAIMED: Fraction(1)}
        for who, cents in allocate(item.total_cents, fractions).items():
            if who == UNCLAIMED:
                if cents:
                    pool.append((portion_label(item.label, fractions[who], item.qty), cents))
                continue
            if cents or fractions[who] > 0:
                shares[who].lines.append((portion_label(item.label, fractions[who], item.qty), cents))
                shares[who].items_cents += cents

    for label, cents in pool:
        if unclaimed == "payer" and payer in shares:
            shares[payer].lines.append((f"{label} (unclaimed)", cents))
            shares[payer].items_cents += cents
            continue
        for who, part in allocate(cents, {h: 1 for h in members}).items():
            if part:
                shares[who].lines.append((f"{label} (split {len(members)} ways)", part))
                shares[who].items_cents += part

    basis = {h: s.items_cents for h, s in shares.items()}
    for attr in ("tax_cents", "tip_cents", "fees_cents", "discount_cents"):
        for who, part in allocate(getattr(charges, attr), basis).items():
            setattr(shares[who], attr, part)

    return Result(shares=shares, unclaimed=pool)

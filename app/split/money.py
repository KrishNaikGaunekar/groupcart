"""Money as integer cents. Every amount that leaves this module sums exactly."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from fractions import Fraction
from typing import Hashable, Mapping, TypeVar

K = TypeVar("K", bound=Hashable)


def to_cents(value) -> int:
    """Parse dollars from a number or a string like "$1,234.50" into cents."""
    if value is None or value == "":
        return 0
    if isinstance(value, str):
        value = value.replace("$", "").replace(",", "").strip()
    try:
        return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except InvalidOperation as exc:
        raise ValueError(f"not a money amount: {value!r}") from exc


def fmt(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) // 100}.{abs(cents) % 100:02d}"


def allocate(total_cents: int, weights: Mapping[K, Fraction | int | float]) -> dict[K, int]:
    """Split total_cents across keys in proportion to weights.

    Largest-remainder rounding: the parts always sum to total_cents, and ties
    go to the earlier key so the result is deterministic. Zero total weight
    splits evenly.
    """
    keys = list(weights)
    if not keys:
        return {}
    w = {k: Fraction(weights[k]).limit_denominator(10**6) for k in keys}
    total_w = sum(w.values())
    if total_w <= 0:
        w = {k: Fraction(1) for k in keys}
        total_w = Fraction(len(keys))
    exact = {k: Fraction(total_cents) * w[k] / total_w for k in keys}
    out = {k: int(exact[k] // 1) for k in keys}
    leftover = total_cents - sum(out.values())
    by_remainder = sorted(keys, key=lambda k: (-(exact[k] - out[k]), keys.index(k)))
    for k in by_remainder[:leftover]:
        out[k] += 1
    return out

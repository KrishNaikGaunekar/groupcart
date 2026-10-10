"""Find and take apart card details in free text. Pure functions, no I/O.

A number only counts as a card when it passes the Luhn check AND starts like a
real card network. That keeps order numbers, timestamps and account ids — which
pass Luhn one time in ten by chance — from being mistaken for cards.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

_RUN = re.compile(r"\d(?:[ -]?\d)*")  # digits, optionally grouped by single spaces or dashes
_EXPIRY = re.compile(r"(?<!\d)(0?[1-9]|1[0-2])\s*[/-]\s*(20\d{2}|\d{2})(?!\d)")
_CVC = re.compile(r"(?<!\d)(\d{3,4})(?!\d)")
_ZIP = re.compile(r"(?:zip|postal)(?:\s*code)?\D{0,3}(\d{5})", re.IGNORECASE)

REDACTED = "[card number removed]"


def luhn_ok(digits: str) -> bool:
    total = 0
    for index, ch in enumerate(reversed(digits)):
        n = int(ch)
        if index % 2:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


def network(digits: str) -> Optional[str]:
    n, two, four = len(digits), int(digits[:2]), int(digits[:4])
    if digits[0] == "4" and n in (13, 16, 19):
        return "Visa"
    if n == 16 and (51 <= two <= 55 or 2221 <= four <= 2720):
        return "Mastercard"
    if n == 15 and two in (34, 37):
        return "Amex"
    if 16 <= n <= 19 and (four == 6011 or two == 65 or 644 <= int(digits[:3]) <= 649):
        return "Discover"
    if 16 <= n <= 19 and 3528 <= four <= 3589:
        return "JCB"
    return None


def find_numbers(text: str) -> list[tuple[int, int, str]]:
    """(start, end, digits) for every card number in text."""
    text = text or ""
    found = []
    for run in _RUN.finditer(text):
        groups = [(run.start() + g.start(), run.start() + g.end(), g.group()) for g in re.finditer(r"\d+", run.group())]
        i = 0
        while i < len(groups):
            # Longest valid stretch of groups first, so "4242 4242 4242 4242 12/29" ends at the card.
            for j in range(len(groups), i, -1):
                digits = "".join(g[2] for g in groups[i:j])
                start, end = groups[i][0], groups[j - 1][1]
                decimal = text[start - 1:start] == "." or re.match(r"\.\d", text[end:end + 2])
                if 13 <= len(digits) <= 19 and not decimal and luhn_ok(digits) and network(digits):
                    found.append((start, end, digits))
                    i = j
                    break
            else:
                i += 1
    return found


def scrub(text: str) -> str:
    """text with every card number replaced. Returns the same object when there is nothing to remove."""
    numbers = find_numbers(text)
    if not numbers:
        return text
    out, cursor = [], 0
    for start, end, _ in numbers:
        out += [text[cursor:start], REDACTED]
        cursor = end
    return "".join(out) + text[cursor:]


@dataclass
class Card:
    number: Optional[str] = None
    exp_month: Optional[str] = None
    exp_year: Optional[str] = None
    cvc: Optional[str] = None
    postal_code: Optional[str] = None

    @property
    def complete(self) -> bool:
        return bool(self.number and self.exp_month and self.exp_year and self.cvc)

    @property
    def missing(self) -> list[str]:
        return [label for label, value in (("card number", self.number), ("expiry (MM/YY)", self.exp_month),
                                           ("security code", self.cvc)) if not value]

    @property
    def last4(self) -> str:
        return (self.number or "")[-4:]

    @property
    def brand(self) -> str:
        return (network(self.number) if self.number else None) or "card"

    def merge(self, other: "Card") -> "Card":
        return Card(*(mine or theirs for mine, theirs in zip(self.fields(), other.fields())))

    def fields(self) -> tuple:
        return (self.number, self.exp_month, self.exp_year, self.cvc, self.postal_code)


def parse(text: str) -> Card:
    """Whatever card details a message contains. Fields it does not mention stay None."""
    text = text or ""
    card = Card()
    numbers = find_numbers(text)
    if numbers:
        start, end, digits = numbers[0]
        card.number = digits
        text = text[:start] + " " + text[end:]
    zip_match = _ZIP.search(text)
    if zip_match:
        card.postal_code = zip_match.group(1)
        text = text[:zip_match.start()] + " " + text[zip_match.end():]
    expiry = _EXPIRY.search(text)
    if expiry:
        card.exp_month = expiry.group(1).zfill(2)
        card.exp_year = expiry.group(2) if len(expiry.group(2)) == 4 else "20" + expiry.group(2)
        text = text[:expiry.start()] + " " + text[expiry.end():]
    cvc = _CVC.search(text)
    if cvc:
        card.cvc = cvc.group(1)
    return card

"""Run from the repo root:  python3 -m unittest discover -s app/tests -v"""
import os
import sys
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.pop("NESSIE_API_KEY", None)  # these tests use the simulated bank

from split.bank import Bank  # noqa: E402
from split.flow import Flow, SplitError  # noqa: E402
from split.ledger import Ledger, normalize_handle  # noqa: E402
from split.money import allocate, fmt, to_cents  # noqa: E402
from split.notify import Notifier  # noqa: E402
from split.splitter import Charges, Claim, Item, compute  # noqa: E402

BOB, JOHN, SUSAN, CHARLIE = "+19195550001", "+19195550002", "+19195550003", "+19195550004"

DINNER = [
    {"name": "California roll", "total": 8.50},
    {"name": "Dr Pepper", "total": 3.00},
    {"name": "Spicy ramen", "total": 16.00},
    {"name": "Edamame", "total": 6.00},
    {"name": "Salmon nigiri", "total": 14.00},
    {"name": "Sapporo", "total": 14.00, "qty": 2},
    {"name": "Chicken katsu", "total": 15.00},
]


class MoneyTest(unittest.TestCase):
    def test_parsing_and_formatting(self):
        self.assertEqual(to_cents("$1,234.50"), 123450)
        self.assertEqual(to_cents(0.1 + 0.2), 30)
        self.assertEqual(fmt(-5), "-$0.05")

    def test_allocation_always_sums(self):
        self.assertEqual(allocate(100, {"a": 1, "b": 1, "c": 1}), {"a": 34, "b": 33, "c": 33})
        for total in (1, 7, 555, 9999, -501):
            parts = allocate(total, {"a": Fraction(1, 3), "b": 2, "c": 0.5})
            self.assertEqual(sum(parts.values()), total)


class SplitterTest(unittest.TestCase):
    def test_shared_and_partial_items(self):
        items = [Item(1, "ramen", 1600), Item(2, "edamame", 600), Item(3, "pizza", 2000)]
        claims = [Claim(1, "john"), Claim(2, "john"), Claim(2, "susan"), Claim(3, "john", 0.25)]
        result = compute(items, ["bob", "john", "susan"], claims, Charges(tax_cents=420, tip_cents=840), payer="bob")
        self.assertEqual(result.total_cents, 1600 + 600 + 2000 + 420 + 840)
        self.assertEqual(result.shares["susan"].items_cents, 300 + 500)  # half the edamame + a third of the unclaimed pizza
        self.assertEqual(result.shares["john"].items_cents, 1600 + 300 + 500 + 500)
        self.assertEqual(result.unclaimed, [("¾ pizza", 1500)])

    def test_payer_can_absorb_unclaimed(self):
        result = compute([Item(1, "fries", 500)], ["bob", "john"], [], payer="bob", unclaimed="payer")
        self.assertEqual(result.shares["bob"].total_cents, 500)
        self.assertEqual(result.shares["john"].total_cents, 0)


class FlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.tmp.name) / "ledger.db")
        self.sent = []
        self.flow = Flow(self.ledger, Notifier(self.ledger, lambda to, body, media: self.sent.append((to, body, media))),
                         Bank(self.ledger))
        for handle, name in ((BOB, "Bob"), (JOHN, "John"), (SUSAN, "Susan"), (CHARLIE, "Charlie")):
            self.ledger.touch_person(handle, chat_id=f"any;-;{handle}", platform="photon")
            self.ledger.update_person(handle, name=name)
        self.ledger.update_person(BOB, venmo="bob-pays")

    def tearDown(self):
        self.tmp.cleanup()

    def open_dinner(self, **extra):
        return self.flow.open(BOB, merchant="Sushi Nikko", items=DINNER, tax=5.55, tip=15, total=97.05,
                              participants=["John", "susan", "Charlie"],
                              payer_items=[{"item": "california roll"}, {"item": "dr pepper"}], **extra)

    def texts_to(self, handle):
        return [body for to, body, _ in self.sent if to == handle]

    def test_dinner_from_receipt_to_settled(self):
        opened = self.open_dinner()
        split_id = opened["split_id"]
        self.assertEqual(opened["asked"], ["John", "Susan", "Charlie"])
        self.assertIn("what did you have?", self.texts_to(JOHN)[0])
        self.assertEqual(self.texts_to(BOB), [])  # the payer is not asked about their own bill

        self.flow.claim(JOHN, items=[{"item": "3"}, {"item": "edamame"}, {"item": "sapporo", "count": 1}])
        self.flow.claim(SUSAN, items=[{"item": "Edamame"}, {"item": "salmon"}])
        last = self.flow.claim(CHARLIE, items=[{"item": "katsu"}, {"item": "Sapporo", "count": 1}])
        self.assertIn("finalized", last)  # the last answer settles the shares without anyone asking

        owes = {m["handle"]: m["owes_cents"] for m in self.ledger.members(split_id)}
        self.assertEqual(sum(owes.values()), 9705)
        # John: ramen 16 + half edamame 3 + one Sapporo 7 = 26.00 of a 76.50 subtotal
        self.assertEqual(owes[JOHN], 2600 + round(555 * 2600 / 7650) + round(1500 * 2600 / 7650))
        self.assertIn("you owe Bob", self.texts_to(JOHN)[-1])
        self.assertIn("venmo.com/bob-pays", self.texts_to(JOHN)[-1])

        before = self.flow.bank.balance_cents(self.flow.bank.account_for(BOB))
        self.flow.pay(JOHN, method="capital_one")
        self.assertEqual(self.flow.bank.balance_cents(self.flow.bank.account_for(BOB)), before + owes[JOHN])
        self.flow.pay(SUSAN, method="venmo")
        done = self.flow.pay(CHARLIE, method="capital_one")
        self.assertTrue(done["settled"])
        self.assertEqual(self.ledger.split(split_id)["status"], "settled")

        kinds = [row["kind"] for row in self.ledger.transcript(split_id)]
        self.assertEqual(kinds, ["open", "claim", "claim", "claim", "final", "paid", "paid", "paid", "settled"])

    def test_bank_nets_out_to_the_payers_own_share(self):
        split_id = self.open_dinner()["split_id"]
        for who in (JOHN, SUSAN, CHARLIE):
            self.flow.claim(who, nothing=True)
        for who in (JOHN, SUSAN, CHARLIE):
            self.flow.pay(who)
        bob_share = self.ledger.member(split_id, BOB)["owes_cents"]
        self.assertEqual(self.flow.bank.balance_cents(self.flow.bank.account_for(BOB)), 50000 - bob_share)

    def test_unknown_friend_is_reported_not_guessed(self):
        with self.assertRaises(SplitError) as caught:
            self.flow.open(BOB, merchant="Cafe", items=[{"name": "latte", "total": 5}], participants=["Zed"])
        self.assertIn("Zed", str(caught.exception))
        self.ledger.add_contact(BOB, "Zed", "919 555 0009")
        self.ledger.touch_person("+19195550009")
        opened = self.flow.open(BOB, merchant="Cafe", items=[{"name": "latte", "total": 5}], participants=["Zed"])
        self.assertEqual(len(opened["members"]), 2)

    def test_receipt_that_does_not_add_up_is_squared_by_an_adjustment(self):
        opened = self.flow.open(BOB, merchant="Diner", items=[{"name": "burger", "total": 10}], tax=1, total=11.50,
                                participants=["John"])
        self.assertEqual(opened["adjustment"], "$0.50")
        self.flow.claim(JOHN, items=[{"item": "burger"}])
        self.assertEqual(sum(m["owes_cents"] for m in self.ledger.members(opened["split_id"])), 1150)

    def test_only_the_payer_finalizes_and_ambiguous_items_are_refused(self):
        split_id = self.open_dinner()["split_id"]
        with self.assertRaises(SplitError):
            self.flow.finalize(JOHN, split_id=split_id, force=True)
        with self.assertRaises(SplitError):
            self.flow.claim(JOHN, items=[{"item": "roll or ramen maybe"}])
        self.flow.finalize(BOB, split_id=split_id, force=True)
        self.assertEqual(sum(m["owes_cents"] for m in self.ledger.members(split_id)), 9705)

    def test_handles_normalize(self):
        self.assertEqual(normalize_handle("(919) 555-0001"), BOB)
        self.assertEqual(normalize_handle("A@B.com"), "a@b.com")


if __name__ == "__main__":
    unittest.main()

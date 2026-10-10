"""Run from the repo root:  python3 -m unittest discover -s vault/tests -v

Card numbers below are the card networks' published test numbers.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cardvault.cards import REDACTED, find_numbers, parse, scrub  # noqa: E402
from cardvault.guard import Guard  # noqa: E402
from cardvault.intake import Intake, origins_for  # noqa: E402
from cardvault.state import State  # noqa: E402
from cardvault.tools import Tools  # noqa: E402

VISA, AMEX = "4242424242424242", "378282246310005"
BOB, JOHN = "+19195550001", "+19195550002"


class FakeVault:
    """Stands in for the runtime's encrypted vault."""

    def __init__(self):
        self.items = {}

    def add_payment(self, label, card, origin):
        item_id = f"vault_{len(self.items):012d}"
        self.items[item_id] = {"kind": "payment", "origin": origin, "label": label, "number": card.number}
        return item_id

    def remove(self, item_id):
        self.items.pop(item_id, None)

    def kind_and_origin(self, item_id):
        item = self.items.get(item_id)
        return (item["kind"], item["origin"]) if item else (None, None)


class CardsTest(unittest.TestCase):
    def test_finds_cards_however_they_are_typed(self):
        for text in (VISA, "4242 4242 4242 4242", "card: 4242-4242-4242-4242 thx", f"amex {AMEX}"):
            self.assertEqual(len(find_numbers(text)), 1, text)

    def test_ignores_numbers_that_are_not_cards(self):
        for text in ("order 1728570000000 shipped", "call 9195550001", "acct 3156820328799172", "4242 4242 4242 4241", "$1234567890123.00"):
            self.assertEqual(find_numbers(text), [], text)

    def test_parses_a_whole_card_from_one_message(self):
        card = parse("4242 4242 4242 4242 exp 4/29 cvc 123 zip 27514")
        self.assertEqual((card.number, card.exp_month, card.exp_year, card.cvc, card.postal_code),
                         (VISA, "04", "2029", "123", "27514"))
        self.assertTrue(card.complete)
        self.assertEqual((card.brand, card.last4), ("Visa", "4242"))

    def test_scrub_removes_only_the_number(self):
        self.assertEqual(scrub(f"use {VISA} please"), f"use {REDACTED} please")
        plain = "nothing to see"
        self.assertIs(scrub(plain), plain)


class VaultFlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = State(Path(self.tmp.name) / "state.json")
        self.vault = FakeVault()
        self.intake = Intake(self.state, self.vault)
        self.guard = Guard(self.state, self.vault)
        self.paid_up = False
        self.tools = Tools(self.state, self.intake, lambda split_id: (self.paid_up, [] if self.paid_up else ["John"]))
        self.call = self.tools.handlers()

    def tearDown(self):
        self.tmp.cleanup()
        os.environ.pop("GROUPCART_SESSION_USER_ID", None)

    def as_user(self, handle, tool, **args):
        os.environ["GROUPCART_SESSION_USER_ID"] = handle
        return json.loads(self.call[tool](args))

    def fill(self, handle, item_id):
        os.environ["GROUPCART_SESSION_USER_ID"] = handle
        return json.loads(self.guard.around_tool("browser_vault_fill", {"handle": item_id},
                                                 lambda args: json.dumps({"success": True, "filled_fields": 4})))

    def save_bobs_card(self):
        self.as_user(BOB, "card_request", sites=["amazon.com"])
        return self.intake.on_text(BOB, "4242 4242 4242 4242 12/29 123")

    def test_card_never_reaches_the_model(self):
        note = self.save_bobs_card()
        self.assertIn("ending 4242", note)
        self.assertNotIn(VISA, note)
        self.assertNotIn("123", note.replace("4242", ""))
        self.assertEqual(sorted(i["origin"] for i in self.vault.items.values()), ["https://amazon.com", "https://www.amazon.com"])
        self.assertIsNone(self.intake.on_text(BOB, "what's the status of dinner?"))  # ordinary texts pass untouched
        status = self.as_user(BOB, "card_status")
        self.assertEqual(status["cards"], [{"card": "Visa ending 4242", "sites": "amazon.com"}])
        self.assertNotIn(VISA, Path(self.state.path).read_text())  # nothing secret in our own state file

    def test_card_sent_in_pieces_or_before_naming_sites(self):
        self.assertIn("Still needed", self.intake.on_text(BOB, "my card is 4242424242424242"))
        self.assertIn("have not said which sites", self.intake.on_text(BOB, "12/29 and 123"))
        self.assertEqual(self.vault.items, {})  # held in memory, not saved, until sites are named
        saved = self.as_user(BOB, "card_request", sites=["https://www.target.com/checkout"])
        self.assertTrue(saved["saved"])
        self.assertEqual(len(self.vault.items), 2)

    def test_card_is_only_filled_by_its_owner_after_the_gate(self):
        self.save_bobs_card()
        item = next(i for i, v in self.vault.items.items() if v["origin"] == "https://www.amazon.com")
        self.assertEqual(self.fill(JOHN, item)["error_type"], "not_yours")
        self.assertEqual(self.fill(BOB, item)["error_type"], "checkout_not_cleared")

        self.assertFalse(self.as_user(BOB, "checkout_start", site="amazon.com", total=42.5, what="cables", group_order="ask")["cleared"])
        self.assertTrue(self.as_user(BOB, "checkout_start", site="amazon.com", total=42.5, what="cables", group_order="solo")["cleared"])
        self.assertTrue(self.fill(BOB, item)["success"])
        self.assertEqual(self.fill(BOB, item)["error_type"], "checkout_not_cleared")  # one clearance, one fill

    def test_group_order_clears_only_when_everyone_has_paid(self):
        self.save_bobs_card()
        blocked = self.as_user(BOB, "checkout_start", site="amazon.com", total=80, what="party supplies",
                               group_order="split", split_id="tab-abcd")
        self.assertEqual((blocked["cleared"], blocked["waiting_on"]), (False, ["John"]))
        self.paid_up = True
        self.assertTrue(self.as_user(BOB, "checkout_start", site="amazon.com", total=80, what="party supplies",
                                     group_order="split", split_id="tab-abcd")["cleared"])

    def test_people_only_see_their_own_vault_items(self):
        self.save_bobs_card()
        os.environ["GROUPCART_SESSION_USER_ID"] = JOHN
        listing = json.dumps({"success": True, "items": [{"handle": h, "kind": "payment"} for h in self.vault.items]})
        seen = json.loads(self.guard.around_tool("browser_vault_list", {}, lambda args: listing))
        self.assertEqual(seen["items"], [])
        os.environ["GROUPCART_SESSION_USER_ID"] = BOB
        self.assertEqual(len(json.loads(self.guard.around_tool("browser_vault_list", {}, lambda args: listing))["items"]), 2)

    def test_second_net_scrubs_requests_and_results(self):
        request = {"messages": [{"role": "user", "content": f"it's {VISA}"},
                                {"role": "user", "content": [{"type": "text", "text": f"again {AMEX}"}]}]}
        cleaned = self.guard.scrub_request(request)["request"]
        self.assertNotIn(VISA, json.dumps(cleaned))
        self.assertNotIn(AMEX, json.dumps(cleaned))
        self.assertIsNone(self.guard.scrub_request({"messages": [{"role": "user", "content": "hi"}]}))
        self.assertEqual(self.guard.scrub_result(result=f"typed {VISA}"), f"typed {REDACTED}")

    def test_sites_become_exact_origins(self):
        self.assertEqual(origins_for("Amazon.com"), ["https://amazon.com", "https://www.amazon.com"])
        self.assertEqual(origins_for("https://shop.example.co.uk/cart"), ["https://shop.example.co.uk"])


if __name__ == "__main__":
    unittest.main()

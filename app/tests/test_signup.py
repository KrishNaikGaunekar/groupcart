"""Run from the repo root:  python3 -m unittest discover -s app/tests -v"""
import json
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from split.ledger import Ledger  # noqa: E402
from split.signup import DRY_RUN_NUMBER, PER_MINUTE, Signup, SignupError, serve  # noqa: E402

BOB = "+19195550001"


class FakePhoton:
    """Stands in for the Photon users API: nothing here reaches the network or uses a real slot."""

    def __init__(self, users=(), assign="+16285550100"):
        self.users, self.assign, self.added = list(users), assign, []

    def list(self):
        return list(self.users)

    def add(self, phone, first, last=""):
        user = {"phoneNumber": phone, "firstName": first, "lastName": last, "assignedPhoneNumber": self.assign}
        self.users.append(user)
        self.added.append(user)
        return user


class SignupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ledger = Ledger(Path(self.tmp.name) / "ledger.db")
        self.photon = FakePhoton()
        self.signup = Signup(self.ledger, self.photon, invite_code="lilac")
        self.asked = 0

    def ask(self, **fields):
        self.asked += 1          # a new address each time, so only the throttle test is throttled
        return self.signup.signup({"name": "Bob Smith", "phone": "919 555 0001", "code": "lilac", **fields}, f"10.0.0.{self.asked}")

    def refused(self, status, **fields):
        with self.assertRaises(SignupError) as caught:
            self.ask(**fields)
        self.assertEqual(caught.exception.status, status)
        return caught.exception.message

    def test_new_person_gets_a_number_and_a_name_in_the_ledger(self):
        status, body = self.ask()
        self.assertEqual((status, body), (200, {"agent_number": "+16285550100", "name": "Bob", "known": False}))
        self.assertEqual(self.photon.added[0]["phoneNumber"], BOB)
        self.assertEqual((self.photon.added[0]["firstName"], self.photon.added[0]["lastName"]), ("Bob", "Smith"))
        self.assertEqual(self.ledger.person(BOB)["name"], "Bob")

    def test_signing_up_twice_does_not_register_twice(self):
        self.ask()
        status, body = self.ask(name="Robert")
        self.assertEqual((status, body["known"], len(self.photon.added)), (200, True, 1))

    def test_a_name_the_person_gave_their_agent_is_kept(self):
        self.ledger.update_person(BOB, name="Bobby")
        self.ask(name="Robert Smith")
        self.assertEqual(self.ledger.person(BOB)["name"], "Bobby")

    def test_number_not_assigned_yet_says_pending(self):
        self.photon.assign = None
        self.assertEqual(self.ask(), (202, {"pending": True}))
        self.photon.users[0]["assignedPhoneNumber"] = "+16285550100"
        self.assertEqual(self.ask()[1]["agent_number"], "+16285550100")
        self.assertEqual(len(self.photon.added), 1)

    def test_invite_code_is_required_and_forgiving_about_case(self):
        self.refused(403, code="nope")
        self.refused(403, code="")
        self.assertEqual(self.ask(code="  LILAC ")[0], 200)
        self.assertEqual(Signup(self.ledger, self.photon).invite_code, "")
        with self.assertRaises(SignupError) as closed:
            Signup(self.ledger, self.photon).signup({"name": "Bob", "phone": BOB, "code": ""})
        self.assertEqual(closed.exception.status, 503)

    def test_bad_names_and_phones_are_refused_before_photon_is_called(self):
        for name in ("", "   ", "x" * 41, "1234", "<script>"):
            self.refused(400, name=name)
        for phone in ("", "555-0001", "not a phone", "bob@example.com"):
            self.refused(400, phone=phone)
        self.assertEqual(self.photon.added, [])
        self.assertEqual(self.ask(name="José O'Neil-Smith")[1]["name"], "José")

    def test_throttled_per_address(self):
        now = [0.0]
        signup = Signup(self.ledger, self.photon, invite_code="lilac", clock=lambda: now[0])
        payload = {"name": "Bob", "phone": BOB, "code": "wrong"}
        for _ in range(PER_MINUTE):
            with self.assertRaises(SignupError) as wrong:
                signup.signup(payload, "9.9.9.9")
            self.assertEqual(wrong.exception.status, 403)
        with self.assertRaises(SignupError) as slow:
            signup.signup(payload, "9.9.9.9")
        self.assertEqual(slow.exception.status, 429)
        with self.assertRaises(SignupError) as other:
            signup.signup(payload, "8.8.8.8")          # someone else is not held up
        self.assertEqual(other.exception.status, 403)
        now[0] = 61.0
        with self.assertRaises(SignupError) as later:
            signup.signup(payload, "9.9.9.9")
        self.assertEqual(later.exception.status, 403)

    def test_dry_run_never_touches_photon(self):
        signup = Signup(self.ledger, None, invite_code="lilac", dry_run=True)
        status, body = signup.signup({"name": "Bob", "phone": BOB, "code": "lilac"})
        self.assertEqual((status, body["agent_number"], body["dry_run"]), (200, DRY_RUN_NUMBER, True))

    def test_over_http(self):
        server = serve(self.signup, 0)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_address[1]}"

        def call(path, payload=None, raw=None):
            data = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
            request = urllib.request.Request(base + path, data=data, headers={"content-type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    return response.status, json.loads(response.read())
            except urllib.error.HTTPError as exc:
                with exc:
                    return exc.code, json.loads(exc.read())

        self.assertEqual(call("/health"), (200, {"ok": True, "signups": "open"}))
        ok = {"name": "Bob Smith", "phone": "9195550001", "code": "lilac"}
        self.assertEqual(call("/signup", ok)[1]["agent_number"], "+16285550100")
        self.assertEqual(call("/api/signup", ok)[1]["known"], True)        # with or without the proxy's prefix
        self.assertEqual(call("/signup", {**ok, "code": "x"})[0], 403)
        self.assertEqual(call("/signup", raw=b"not json")[0], 400)
        self.assertEqual(call("/signup", raw=b"x" * 5000)[0], 400)
        self.assertEqual(call("/nope", ok)[0], 404)


if __name__ == "__main__":
    unittest.main()

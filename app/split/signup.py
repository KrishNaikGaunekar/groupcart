"""Give someone an agent from the website: name and phone in, their agent's number out.

This is the signup endpoint in docs/HOSTED_PLAN.md. It registers the phone on our
Photon project (the call scripts/photon_users.py makes by hand), saves the
person's name in the ledger so their agent greets them by name, and answers with
the number that person should text.

    POST /signup   {"name": "Bob Smith", "phone": "919 555 1234", "code": "<invite code>"}
        200 {"agent_number": "+1628...", "name": "Bob", "known": false}
        202 {"pending": true}     Photon has not assigned a number yet; ask again in a few seconds
        4xx {"error": "..."}      something the person can fix
    GET  /health   {"ok": true}

It runs inside the gateway (see __init__.py) when GROUPCART_SIGNUP_PORT is set, so
there is no second service to deploy. It listens on localhost; put a TLS proxy in
front of it. Standard library only. `Signup` holds the rules and does no I/O of
its own, so app/tests covers it with a stand-in for Photon.

    GROUPCART_SIGNUP_PORT      port to listen on; unset means signup is off
    GROUPCART_INVITE_CODE      what a person must type to sign up; unset means signups are closed
    GROUPCART_SIGNUP_DRY_RUN   1 = never call Photon, hand back a made-up number (for trying the site)
    GROUPCART_SIGNUP_ORIGIN    a site allowed to call this from the browser, if not through a proxy
"""
from __future__ import annotations

import base64
import hmac
import json
import logging
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Optional

from .ledger import Ledger, normalize_handle

logger = logging.getLogger(__name__)

PHOTON_HOST = "https://spectrum.photon.codes"
DRY_RUN_NUMBER = "+15555550100"
MAX_BODY = 4096
PER_MINUTE = 6                      # requests one address may make
NAME_OK = re.compile(r"[^\W\d_](?:[^\W\d_]|[ .'\-]){0,39}", re.UNICODE)


class SignupError(Exception):
    """Something to tell the person, with the HTTP status that goes with it."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


class PhotonUsers:
    """The users of our Photon project. A registered user is assigned a number to text."""

    def __init__(self, project: str, secret: str, host: str = PHOTON_HOST):
        self.project, self.secret, self.host = project, secret, host

    def _call(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        token = base64.b64encode(f"{self.project}:{self.secret}".encode()).decode()
        request = urllib.request.Request(
            f"{self.host}/projects/{self.project}{path}", method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": "Basic " + token, "content-type": "application/json", "accept": "application/json",
                     # Photon's edge rejects Python's default client signature.
                     "user-agent": "groupcart-signup/0.1"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            logger.warning("Photon %s %s failed (%s): %s", method, path, exc.code, detail)
            if exc.code in (402, 403, 409, 422, 429) and re.search(r"limit|quota|maximum|plan", detail, re.I):
                raise SignupError(503, "every agent is taken right now. ask us at the table for a spot.") from None
            raise SignupError(502, "could not reach the phone line. try again in a minute.") from None
        except (urllib.error.URLError, TimeoutError) as exc:
            logger.warning("Photon %s %s unreachable: %s", method, path, exc)
            raise SignupError(502, "could not reach the phone line. try again in a minute.") from None

    def list(self) -> list[dict]:
        data = self._call("GET", "/users/").get("data") or {}
        return data.get("users", []) if isinstance(data, dict) else data

    def add(self, phone: str, first: str, last: str = "") -> dict:
        body = {"type": "shared", "phoneNumber": phone, "firstName": first}
        if last:
            body["lastName"] = last
        data = self._call("POST", "/users/", body)
        created = data.get("data") or data.get("user") or data
        return created.get("user", created) if isinstance(created, dict) else {"phoneNumber": phone}


class Signup:
    """The rules. `photon` is anything with list() and add(); `ledger` is the split ledger."""

    def __init__(self, ledger: Ledger, photon: Any, *, invite_code: str = "", dry_run: bool = False,
                 clock: Callable[[], float] = time.monotonic):
        self.ledger, self.photon = ledger, photon
        self.invite_code, self.dry_run, self.clock = invite_code or "", dry_run, clock
        self._seen: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _throttle(self, client: str) -> None:
        now = self.clock()
        with self._lock:
            recent = [t for t in self._seen.get(client, []) if now - t < 60]
            if len(recent) >= PER_MINUTE:
                raise SignupError(429, "slow down a little. try again in a minute.")
            self._seen[client] = recent + [now]

    def signup(self, payload: Any, client: str = "") -> tuple[int, dict]:
        if not isinstance(payload, dict):
            raise SignupError(400, "send a name and a phone number.")
        self._throttle(client or "?")
        if not self.invite_code:
            raise SignupError(503, "signups are closed right now.")
        if not hmac.compare_digest(str(payload.get("code") or "").strip().lower().encode(), self.invite_code.strip().lower().encode()):
            raise SignupError(403, "that invite code is not right.")

        name = " ".join(str(payload.get("name") or "").split())
        if not NAME_OK.fullmatch(name):
            raise SignupError(400, "what should your agent call you? letters only, up to 40.")
        first, _, last = name.partition(" ")

        phone = normalize_handle(str(payload.get("phone") or ""))
        if not re.fullmatch(r"\+\d{8,15}", phone):
            raise SignupError(400, "that does not look like a phone number. include the area code.")

        if self.dry_run:
            number, known = DRY_RUN_NUMBER, False
        else:
            user = next((u for u in self.photon.list() if u.get("phoneNumber") == phone), None)
            known = user is not None
            if user is None:
                user = self.photon.add(phone, first, last)
            number = user.get("assignedPhoneNumber")

        # Their agent greets them by this name. Never overwrite one they gave the agent themselves.
        person = self.ledger.person(phone)
        if not person or not person["name"]:
            self.ledger.update_person(phone, name=first)
        logger.info("signup for ...%s: %s", phone[-4:], "known" if known else ("pending" if not number else "new"))

        if not number:
            return 202, {"pending": True}
        return 200, {"agent_number": number, "name": first, "known": known, **({"dry_run": True} if self.dry_run else {})}


def handler_for(signup: Signup, origin: str = "") -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "groupcart-signup"

        def _send(self, status: int, body: dict) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.send_header("cache-control", "no-store")
            if origin:
                self.send_header("access-control-allow-origin", origin)
                self.send_header("access-control-allow-headers", "content-type")
                self.send_header("vary", "origin")
            self.end_headers()
            self.wfile.write(data)

        def _route(self) -> str:
            path = self.path.split("?", 1)[0].rstrip("/")
            return path[4:] if path.startswith("/api/") else path     # a proxy may or may not strip /api

        def do_OPTIONS(self) -> None:  # noqa: N802 (http.server's naming)
            self._send(204 if origin else 404, {})

        def do_GET(self) -> None:  # noqa: N802
            if self._route() == "/health":
                self._send(200, {"ok": True, "signups": "open" if signup.invite_code else "closed"})
            else:
                self._send(404, {"error": "not here."})

        def do_POST(self) -> None:  # noqa: N802
            if self._route() != "/signup":
                self._send(404, {"error": "not here."})
                return
            try:
                length = int(self.headers.get("content-length") or 0)
                if not 0 < length <= MAX_BODY:
                    raise SignupError(400, "send a name and a phone number.")
                try:
                    payload = json.loads(self.rfile.read(length))
                except ValueError:
                    raise SignupError(400, "send a name and a phone number.") from None
                # behind the proxy the caller's own address is the first one forwarded
                client = (self.headers.get("x-forwarded-for") or self.client_address[0]).split(",")[0].strip()
                status, body = signup.signup(payload, client)
            except SignupError as exc:
                status, body = exc.status, {"error": exc.message}
            except Exception:  # noqa: BLE001  a person is waiting on this; never drop the connection on them
                logger.exception("signup failed")
                status, body = 500, {"error": "something broke on our side. try again in a minute."}
            self._send(status, body)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            logger.debug("signup http: " + format, *args)

    return Handler


def serve(signup: Signup, port: int, host: str = "127.0.0.1", origin: str = "") -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), handler_for(signup, origin))
    threading.Thread(target=server.serve_forever, name="groupcart-signup", daemon=True).start()
    return server


def from_env(ledger: Optional[Ledger] = None) -> Optional[ThreadingHTTPServer]:
    """Start the endpoint as the environment describes it. None when it is switched off."""
    port = os.environ.get("GROUPCART_SIGNUP_PORT", "").strip()
    if not port:
        return None
    env = os.environ.get
    photon = PhotonUsers(env("PHOTON_PROJECT_ID") or env("SPECTRUM_PROJECT_ID") or "",
                         env("PHOTON_PROJECT_SECRET") or env("SPECTRUM_PROJECT_SECRET") or "")
    signup = Signup(ledger or Ledger(), photon, invite_code=env("GROUPCART_INVITE_CODE") or "",
                    dry_run=env("GROUPCART_SIGNUP_DRY_RUN") == "1")
    try:
        server = serve(signup, int(port), env("GROUPCART_SIGNUP_HOST") or "127.0.0.1", env("GROUPCART_SIGNUP_ORIGIN") or "")
    except (OSError, ValueError) as exc:
        logger.warning("signup endpoint not started on port %s: %s", port, exc)
        return None
    logger.info("signup endpoint on port %s (%s%s)", port, "open" if signup.invite_code else "closed: no invite code",
                ", dry run" if signup.dry_run else "")
    return server


_running: Optional[ThreadingHTTPServer] = None


def start_with_gateway() -> Optional[ThreadingHTTPServer]:
    """Called when the plugin loads. Only the long-running gateway serves signups, not `gc chat` or `gc split`."""
    global _running
    if _running is None and "gateway" in sys.argv and "run" in sys.argv:
        _running = from_env()
    return _running


def main() -> None:
    """Run the endpoint on its own, to try the website against it: PYTHONPATH=app python3 -m split.signup"""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    server = from_env()
    if server is None:
        sys.exit("set GROUPCART_SIGNUP_PORT (and GROUPCART_INVITE_CODE) first; see the top of app/split/signup.py")
    print(f"signup endpoint on http://{server.server_address[0]}:{server.server_address[1]}  (ctrl-c to stop)")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()

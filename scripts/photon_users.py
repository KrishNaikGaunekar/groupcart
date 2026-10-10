#!/usr/bin/env python3
"""Give someone an agent: register their phone on our Photon project.

    python3 scripts/photon_users.py list
    python3 scripts/photon_users.py add +19195551234 Bob Smith

On Photon's shared (free) lines nobody can text the agent until their own phone
number is registered as a user of the project. Registering assigns that person
an iMessage number from Photon's pool: the number THEY text to reach their agent.
Different people get different numbers. The free plan allows 10 users.

Uses only SPECTRUM_PROJECT_ID / SPECTRUM_PROJECT_SECRET from the repo-root .env,
so it needs no dashboard login.
"""
from __future__ import annotations

import base64
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HOST = "https://spectrum.photon.codes"
ROOT = Path(__file__).resolve().parent.parent


def credentials() -> tuple[str, str]:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    project, secret = env.get("SPECTRUM_PROJECT_ID"), env.get("SPECTRUM_PROJECT_SECRET")
    if not project or not secret:
        sys.exit("SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET must be set in .env")
    return project, secret


def call(method: str, path: str, body: dict | None = None) -> dict:
    project, secret = credentials()
    request = urllib.request.Request(
        f"{HOST}/projects/{project}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Basic " + base64.b64encode(f"{project}:{secret}".encode()).decode(),
                 "content-type": "application/json", "accept": "application/json",
                 # Photon's edge rejects Python's default client signature.
                 "user-agent": "groupcart-photon-users/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        sys.exit(f"Photon {method} {path} failed ({exc.code}): {exc.read().decode(errors='replace')[:300]}")


def users() -> list[dict]:
    data = call("GET", "/users/").get("data") or {}
    return data.get("users", []) if isinstance(data, dict) else data


def show(user: dict) -> None:
    name = " ".join(filter(None, [user.get("firstName"), user.get("lastName")])) or "(no name)"
    line = user.get("assignedPhoneNumber") or "not assigned yet — run `list` again in a minute"
    print(f"{name:<20} {user.get('phoneNumber', ''):<15} texts their agent at: {line}")


def main(argv: list[str]) -> None:
    if argv[:1] == ["list"]:
        found = users()
        for user in found:
            show(user)
        print(f"{len(found)} registered (the free plan allows 10)")
    elif argv[:1] == ["add"] and len(argv) >= 2:
        phone = re.sub(r"[^\d+]", "", argv[1])
        if len(phone) == 10:
            phone = "+1" + phone
        if not re.fullmatch(r"\+\d{8,15}", phone):
            sys.exit(f"need a full phone number like +19195551234, got {argv[1]!r}")
        existing = next((u for u in users() if u.get("phoneNumber") == phone), None)
        if existing:
            print("already registered:")
            show(existing)
            return
        body = {"type": "shared", "phoneNumber": phone}
        body.update({k: v for k, v in (("firstName", argv[2] if len(argv) > 2 else None),
                                       ("lastName", " ".join(argv[3:]) or None)) if v})
        data = call("POST", "/users/", body)
        created = data.get("data") or data.get("user") or data
        show(created.get("user", created) if isinstance(created, dict) else {"phoneNumber": phone})
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])

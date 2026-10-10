"""`./gc split ...` and the in-chat `/room` command: look at splits from outside a conversation."""
from __future__ import annotations

import time
from typing import Optional

from . import session
from .ledger import Ledger
from .money import fmt


def _render(ledger: Ledger, rows: list[dict]) -> str:
    out, current = [], None
    for row in rows:
        if row["split_id"] != current:
            current = row["split_id"]
            split = ledger.split(current)
            out.append(f"\n── {current} · {split['merchant']} · {fmt(split['total_cents'])} · {split['status']} ──")
        speaker = f"{ledger.display_name(row['speaker'])}'s agent"
        body = row["body"].replace("\n", "\n" + " " * 4)
        out.append(f"  {speaker}: {body}" + ("  [receipt attached]" if row["media"] else ""))
    return "\n".join(out).strip()


def room_command(raw_args: str = "") -> str:
    """/room [split id] — the agents' conversation about the caller's latest split."""
    from .tools import flow

    ledger, me = flow().ledger, session.current().handle
    split_id: Optional[str] = (raw_args or "").strip().upper() or None
    if not split_id:
        mine = ledger.splits_for(me, open_only=False) if me else []
        if not mine:
            return "no splits yet — send me a receipt and tell me who it was with"
        split_id = mine[0]["id"]
    if not ledger.split(split_id) or (me and not ledger.member(split_id, me)):
        return f"no split {split_id} that you are part of"
    return _render(ledger, ledger.transcript(split_id)) or "the room is empty"


def setup(subparser) -> None:
    subs = subparser.add_subparsers(dest="split_command")
    room = subs.add_parser("room", help="Print the agents' room (all splits, or one)")
    room.add_argument("split_id", nargs="?")
    room.add_argument("--watch", action="store_true", help="Keep printing new messages as agents post them")
    subs.add_parser("people", help="Everyone who has an agent, and how they get paid")
    outbox = subs.add_parser("outbox", help="Every text an agent sent to a human")
    outbox.add_argument("--to", help="Only messages to this phone number")
    subparser.set_defaults(func=dispatch)


def dispatch(args) -> None:
    ledger = Ledger()
    command = getattr(args, "split_command", None)
    if command == "room":
        split_id = args.split_id.upper() if args.split_id else None
        last = 0
        while True:
            rows = ledger.transcript(split_id, after_id=last)
            if rows:
                print(_render(ledger, rows), flush=True)
                last = rows[-1]["id"]
            if not args.watch:
                break
            time.sleep(1)
    elif command == "people":
        for p in ledger._all("SELECT * FROM people ORDER BY created_at"):
            pay = ", ".join(f"{k} {p[k]}" for k in ("venmo", "zelle", "paypal", "cashapp") if p[k]) or "no payment handles"
            print(f"{p['name'] or '(no name yet)':<14} {p['handle']:<16} {'reachable' if p['chat_id'] else 'has not texted in':<18} {pay}")
    elif command == "outbox":
        for m in ledger.outbox(args.to):
            mark = "✓" if m["delivered"] else f"✗ {m['error']}"
            print(f"→ {ledger.display_name(m['to_handle'])} [{mark}]\n    " + m["body"].replace("\n", "\n    ")
                  + ("\n    [receipt attached]" if m["media"] else ""))
    else:
        print("usage: groupcart split <room|people|outbox>")

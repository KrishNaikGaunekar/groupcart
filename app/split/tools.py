"""Tool handlers. Each acts as the person the current conversation belongs to."""
from __future__ import annotations

import json
import logging
import threading
from typing import Callable, Optional

from . import session
from .bank import Bank, BankError
from .flow import Flow, SplitError
from .ledger import Ledger, PROFILE_FIELDS, normalize_handle
from .money import fmt
from .notify import Notifier, runtime_transport

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_flow: Optional[Flow] = None


def flow() -> Flow:
    """One ledger connection for the process, opened on first use."""
    global _flow
    with _lock:
        if _flow is None:
            ledger = Ledger()
            _flow = Flow(ledger, Notifier(ledger, runtime_transport), Bank(ledger))
        return _flow


def _tool(fn: Callable[[Flow, str, dict], dict]) -> Callable[..., str]:
    """Resolve the speaker, run the handler, and always hand the model JSON."""

    def handler(args: dict, **kwargs) -> str:
        speaker = session.current()
        if not speaker.known:
            return json.dumps({"error": "no sender on this conversation; splits need a phone-number identity "
                                        "(set GROUPCART_SESSION_USER_ID when testing from the CLI)"})
        try:
            f = flow()
            f.ledger.touch_person(speaker.handle, chat_id=speaker.chat_id, platform=speaker.platform)
            return json.dumps(fn(f, speaker.handle, args or {}))
        except (SplitError, BankError) as exc:
            return json.dumps({"error": str(exc)})
        except Exception as exc:
            logger.exception("split tool %s failed", fn.__name__)
            return json.dumps({"error": f"{type(exc).__name__}: {exc}"})

    # Not functools.wraps: the runtime inspects the handler's signature to decide which
    # context keywords to pass, and must see (args, **kwargs), not the wrapped function's.
    handler.__name__ = fn.__name__
    return handler


@_tool
def profile_set(f: Flow, me: str, args: dict) -> dict:
    fields = {k: str(args[k]).strip() for k in PROFILE_FIELDS if args.get(k)}
    person = f.ledger.update_person(me, **fields) if fields else f.ledger.person(me)
    return {"saved": fields, "profile": {k: person[k] for k in PROFILE_FIELDS if person[k]}}


@_tool
def contact_add(f: Flow, me: str, args: dict) -> dict:
    name, handle = str(args.get("name", "")).strip(), normalize_handle(str(args.get("phone", "")))
    if not name or not handle.startswith("+"):
        return {"error": "need a name and a full phone number"}
    f.ledger.add_contact(me, name, handle)
    friend = f.ledger.touch_person(handle)
    if not friend["name"]:
        f.ledger.update_person(handle, name=name)
    return {"saved": name, "has_texted_their_agent": bool(friend["chat_id"]),
            "note": None if friend["chat_id"] else f"{name} has not texted their GroupCart agent yet. On Photon's shared "
                    "lines an agent can only text someone who messaged it first, so ask them to say hi to it."}


@_tool
def split_open(f: Flow, me: str, args: dict) -> dict:
    return f.open(me, merchant=str(args.get("merchant", "")), items=args.get("items") or [],
                  participants=[str(p) for p in args.get("participants") or []], payer_items=args.get("my_items"),
                  tax=args.get("tax", 0), tip=args.get("tip", 0), fees=args.get("fees", 0),
                  discount=args.get("discount", 0), total=args.get("total"), mode=args.get("mode") or "settle")


@_tool
def split_claim(f: Flow, me: str, args: dict) -> dict:
    return f.claim(me, items=args.get("items"), nothing=bool(args.get("nothing")), split_id=args.get("split_id"))


@_tool
def split_status(f: Flow, me: str, args: dict) -> dict:
    return f.status(me, args.get("split_id"))


@_tool
def split_finalize(f: Flow, me: str, args: dict) -> dict:
    return f.finalize(me, split_id=args.get("split_id"), unclaimed=args.get("unclaimed"), force=True)


@_tool
def split_pay(f: Flow, me: str, args: dict) -> dict:
    return f.pay(me, method=args.get("method") or "capital_one", split_id=args.get("split_id"))


@_tool
def split_cancel(f: Flow, me: str, args: dict) -> dict:
    return f.cancel(me, args.get("split_id"))


@_tool
def bank_balance(f: Flow, me: str, args: dict) -> dict:
    account = f.bank.account_for(me)
    recent = [{"date": a["date"], "what": a["description"] or a["kind"], "amount": fmt(a["amount_cents"])}
              for a in f.bank.activity(account)[-6:]]
    from .bank import enabled
    return {"balance": fmt(f.bank.balance_cents(account)), "recent": recent,
            "bank": "Capital One (Nessie sandbox)" if enabled() else "simulated — NESSIE_API_KEY is not set"}


HANDLERS = {fn.__name__: fn for fn in (profile_set, contact_add, split_open, split_claim, split_status,
                                       split_finalize, split_pay, split_cancel, bank_balance)}

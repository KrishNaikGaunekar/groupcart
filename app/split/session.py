"""Who is talking right now.

The gateway binds the inbound sender to the turn; tools and hooks read it here.
Outside the gateway (CLI, `./gc split`, tests) the same names come from the
environment, so `GROUPCART_SESSION_USER_ID=+1555... ./gc chat` acts as that person.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from .ledger import normalize_handle


@dataclass(frozen=True)
class Speaker:
    handle: str
    chat_id: str
    platform: str

    @property
    def known(self) -> bool:
        return bool(self.handle)


def _read(name: str) -> str:
    try:
        from gateway.session_context import get_session_env  # runtime import
    except ImportError:
        return os.environ.get(name, "")
    return get_session_env(name, "") or ""


def current() -> Speaker:
    handle = _read("GROUPCART_SESSION_USER_ID")
    return Speaker(
        handle=normalize_handle(handle) if handle else "",
        chat_id=_read("GROUPCART_SESSION_CHAT_ID"),
        platform=_read("GROUPCART_SESSION_PLATFORM") or _read("GROUPCART_SESSION_SOURCE") or "cli",
    )

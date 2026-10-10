"""The person the current conversation belongs to, or "" outside a messaging session."""
from __future__ import annotations

import os


def handle() -> str:
    try:
        from gateway.session_context import get_session_env  # runtime import
    except ImportError:
        return os.environ.get("GROUPCART_SESSION_USER_ID", "")
    return get_session_env("GROUPCART_SESSION_USER_ID", "") or ""

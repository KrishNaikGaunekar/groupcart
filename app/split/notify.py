"""How an agent reaches a human who is not in the current conversation.

Every outbound message is written to the ledger's outbox first, then handed to
a transport. The outbox is what makes a split inspectable and testable: with no
transport (unit tests, a dry run) the messages are still all there.

The runtime transport goes through the core's send path (live gateway adapter,
or the Photon sidecar when called from a CLI process). That path also mirrors
the text into the recipient's own session, so their agent knows what it "said".
"""
from __future__ import annotations

import json
import logging
import os
from typing import Callable, Optional

from .ledger import Ledger

logger = logging.getLogger(__name__)

# (handle, body, media_path) -> error text, or None when delivered
Transport = Callable[[str, str, Optional[str]], Optional[str]]


def runtime_transport(handle: str, body: str, media: Optional[str]) -> Optional[str]:
    """Deliver over the messaging platform the runtime is connected to."""
    from tools.send_message_tool import send_message_tool  # core internal; the one seam we depend on

    platform = os.environ.get("GROUPCART_SPLIT_PLATFORM", "photon")
    message = f"{body}\nMEDIA:{media}" if media else body
    try:
        result = json.loads(send_message_tool({"action": "send", "target": f"{platform}:{handle}", "message": message}))
    except Exception as exc:  # the send path raises on config errors; a failed text must not abort a split
        return str(exc)
    return None if result.get("success") else str(result.get("error") or "send failed")


class Notifier:
    def __init__(self, ledger: Ledger, transport: Optional[Transport] = None):
        self.ledger = ledger
        self.transport = transport

    def tell(self, handle: str, body: str, *, media: Optional[str] = None, split_id: Optional[str] = None) -> bool:
        error: Optional[str] = "no transport (dry run)"
        if self.transport is not None:
            error = self.transport(handle, body, media)
            if error:
                logger.warning("could not reach %s: %s", self.ledger.display_name(handle), error)
        self.ledger.log_outbound(handle, body, media=media, split_id=split_id, delivered=error is None, error=error)
        return error is None

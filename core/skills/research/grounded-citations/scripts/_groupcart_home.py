"""Resolve GROUPCART_HOME for standalone skill scripts.

Skill scripts may run outside the GroupCart process (system Python, nix env,
CI) where ``groupcart_constants`` is not importable.  This module provides the
same ``get_groupcart_home()`` contract without requiring it on ``sys.path``.

When ``groupcart_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from groupcart_constants import get_groupcart_home as get_groupcart_home
except (ModuleNotFoundError, ImportError):

    def get_groupcart_home() -> Path:
        """Return the GroupCart home directory (default: ``~/.groupcart``)."""
        val = os.environ.get("GROUPCART_HOME", "").strip()
        return Path(val) if val else Path.home() / ".groupcart"

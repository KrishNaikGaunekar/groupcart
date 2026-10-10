"""Resolve GROUPCART_HOME for standalone skill scripts.

Skill scripts may run outside the GroupCart process (e.g. system Python,
nix env, CI) where ``groupcart_constants`` is not importable.  This module
provides the same ``get_groupcart_home()`` and ``display_groupcart_home()``
contracts as ``groupcart_constants`` without requiring it on ``sys.path``.

When ``groupcart_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``groupcart_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``GROUPCART_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from groupcart_constants import display_groupcart_home as display_groupcart_home
    from groupcart_constants import get_groupcart_home as get_groupcart_home
except (ModuleNotFoundError, ImportError):

    def get_groupcart_home() -> Path:
        """Return the GroupCart home directory (default: ~/.groupcart).

        Mirrors ``groupcart_constants.get_groupcart_home()``."""
        val = os.environ.get("GROUPCART_HOME", "").strip()
        return Path(val) if val else Path.home() / ".groupcart"

    def display_groupcart_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``groupcart_constants.display_groupcart_home()``."""
        home = get_groupcart_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)

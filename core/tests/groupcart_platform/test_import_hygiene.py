from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


def test_platform_modules_only_import_stdlib_and_groupcart_platform() -> None:
    root = Path(__file__).resolve().parents[2]
    code = """
import sys
before = set(sys.modules)
import groupcart_platform.host.facts
import groupcart_platform.host.gpu_adapters
import groupcart_platform.host.runtime
import groupcart_platform.host.products
import groupcart_platform.declaration
import groupcart_platform.resolver
import groupcart_platform.resolver.app
import groupcart_platform.resolver.availability
import groupcart_platform.resolver.known_dirs
new_top_levels = {name.partition('.')[0] for name in set(sys.modules) - before}
unexpected = sorted(
    name
    for name in new_top_levels
    if name not in sys.stdlib_module_names and not name.startswith('groupcart_platform')
)
assert not unexpected, unexpected
"""
    env = os.environ.copy()
    env["PYTHONPATH"] = "."

    subprocess.run(
        [sys.executable, "-c", code],
        cwd=root,
        env=env,
        check=True,
    )

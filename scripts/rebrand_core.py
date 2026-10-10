#!/usr/bin/env python3
"""Vendor the upstream agent runtime into core/ and rebrand it.

    python3 scripts/rebrand_core.py --src /path/to/upstream-clone [--dest core]

Steps, in order:
  1. Export every tracked file of the upstream clone into DEST (no .git, so no
     fork relationship and no upstream history).
  2. Rewrite file contents: hermes -> groupcart, Hermes -> GroupCart,
     HERMES -> GROUPCART.
  3. Rename files and directories the same way.
  4. Apply our patch series from core-patches/ (if any).
  5. Write DEST/UPSTREAM.md recording the upstream commit and what was kept.

Identifiers that live *outside* this repo are deliberately left alone, because
renaming them makes them point at things that do not exist:
  - URLs on external hosts (GitHub, nousresearch.com, npm, PyPI, ...)
  - `NousResearch/<repo>` slugs and docker image names
  - LLM model ids (hermes-3-..., Hermes-4-405B, ...)
  - third-party npm packages (hermes-parser, hermes-estree)
DEST/LICENSE is never touched: the MIT licence requires the notice to stay.

Re-run to pick up a newer upstream: delete core/, clone upstream again, run
this script. See docs/UPSTREAM.md.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Hosts whose URLs must keep resolving. Everything else (localhost, example.com,
# route paths) is renamed so it stays consistent with the renamed code.
EXTERNAL_HOSTS = (
    r"(?:[\w-]+\.)*(?:github\.com|githubusercontent\.com|ghcr\.io|nousresearch\.com|"
    r"npmjs\.org|npmjs\.com|pypi\.org|pythonhosted\.org|huggingface\.co|openrouter\.ai|"
    r"reddit\.com|t\.me|x\.com|twitter\.com|discord\.gg|discord\.com|youtube\.com|"
    r"youtu\.be|docker\.io|docker\.com|readthedocs\.io)"
)
_URL_TAIL = r"""[^\s"'<>()\[\]{}`\\|^]*"""

PROTECTED = [
    # External URLs.
    rf"https?://{EXTERNAL_HOSTS}(?::\d+)?/{_URL_TAIL}",
    rf"https?://{EXTERNAL_HOSTS}(?=[\s\"'<>()\[\]{{}}`\\|^]|$)",
    # scp-style git remotes and bare host/owner/repo references.
    r"git@github\.com:[\w.-]+/[\w.-]+",
    r"\bgithub\.com/[\w.-]+/[\w.-]+",
    # Owner/repo slugs, docker images and Hugging Face / OpenRouter model ids.
    r"\b(?:nousresearch|nous)/hermes[\w.:-]*",
    # Model family names and ids: hermes-4-405b, Hermes 3, nous-hermes-3, hermes3.
    # A following digit means a product version ("Hermes 24"), not a model generation.
    r"\b(?:nous-)?hermes[- ]?[2-5](?!\d)[\w.:-]*",
    # Third-party npm packages.
    r"\bhermes-(?:parser|estree)\b",
]
PATTERN = re.compile("(?P<keep>" + "|".join(PROTECTED) + ")|(?P<name>hermes)", re.IGNORECASE)
NAME_ONLY = re.compile("hermes", re.IGNORECASE)

# Never rewritten, whatever they contain.
SKIP_CONTENT = {"LICENSE"}
MAX_TEXT_BYTES = 8 * 1024 * 1024


def rebrand_word(word: str) -> str:
    if word.isupper():
        return "GROUPCART"
    if word[0].isupper():
        return "GroupCart"
    return "groupcart"


def rebrand_text(text: str, stats: Counter) -> str:
    def repl(m: re.Match) -> str:
        if m.group("keep") is not None:
            if NAME_ONLY.search(m.group("keep")):
                stats["kept"] += 1
            return m.group("keep")
        stats["renamed"] += 1
        return rebrand_word(m.group("name"))

    return PATTERN.sub(repl, text)


def rebrand_path_component(name: str) -> str:
    # Third-party package names never appear as tracked paths, so a plain rename is safe here.
    return NAME_ONLY.sub(lambda m: rebrand_word(m.group(0)), name)


def export_tree(src: Path, dest: Path) -> str:
    sha = subprocess.check_output(["git", "-C", str(src), "rev-parse", "HEAD"], text=True).strip()
    dest.mkdir(parents=True)
    subprocess.check_call(["git", "-C", str(src), "checkout-index", "--all", "--force", f"--prefix={dest}{os.sep}"])
    return sha


def rewrite_contents(dest: Path, stats: Counter) -> None:
    for path in sorted(p for p in dest.rglob("*") if p.is_file() and not p.is_symlink()):
        rel = path.relative_to(dest)
        if str(rel) in SKIP_CONTENT:
            continue
        raw = path.read_bytes()
        if b"hermes" not in raw.lower():
            continue
        if b"\0" in raw[:8192] or len(raw) > MAX_TEXT_BYTES:
            stats["skipped_binary"] += 1
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            stats["skipped_non_utf8"] += 1
            continue
        new = rebrand_text(text, stats)
        if new != text:
            mode = path.stat().st_mode
            path.write_bytes(new.encode("utf-8"))
            os.chmod(path, mode)
            stats["files_rewritten"] += 1


def rename_paths(dest: Path, stats: Counter) -> None:
    # Deepest first, so a parent is renamed only after everything inside it.
    for path in sorted(dest.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        new_name = rebrand_path_component(path.name)
        if new_name == path.name:
            continue
        target = path.with_name(new_name)
        if target.exists():
            sys.exit(f"rename collision: {path} -> {target}")
        path.rename(target)
        stats["paths_renamed"] += 1


def apply_patches(dest: Path, stats: Counter) -> None:
    patch_dir = REPO_ROOT / "core-patches"
    for patch in sorted(patch_dir.glob("*.patch")) if patch_dir.is_dir() else []:
        subprocess.check_call(["git", "apply", "--directory", dest.name, str(patch)], cwd=REPO_ROOT)
        stats["patches_applied"] += 1


UPSTREAM_MD = """# Upstream

Everything in this directory is a vendored, rebranded copy of
**Hermes Agent** by Nous Research — https://github.com/NousResearch/hermes-agent —
used under the MIT licence (see `LICENSE` in this directory, unmodified).

- Upstream commit: `{sha}`
- Vendored by: `scripts/rebrand_core.py`
- Rebrand: `hermes` -> `groupcart`, `Hermes` -> `GroupCart`, `HERMES` -> `GROUPCART`
  in file contents and in file and directory names.
- Left as upstream wrote them: external URLs, `NousResearch/...` slugs, model ids
  and third-party npm package names ({kept} occurrences).
- Local changes on top of the rebrand: the patch series in `core-patches/`
  ({patches} applied).

Do not hand-edit files here. Put new behaviour in `app/` or `vault/`; if the
runtime itself has to change, add a patch to `core-patches/`.
See `docs/UPSTREAM.md` in the repo root.
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, type=Path, help="upstream git clone")
    ap.add_argument("--dest", default=REPO_ROOT / "core", type=Path)
    args = ap.parse_args()

    dest = args.dest.resolve()
    if dest.exists():
        sys.exit(f"{dest} already exists; remove it first to re-vendor")

    stats: Counter = Counter()
    sha = export_tree(args.src.resolve(), dest)
    rewrite_contents(dest, stats)
    rename_paths(dest, stats)
    apply_patches(dest, stats)
    (dest / "UPSTREAM.md").write_text(UPSTREAM_MD.format(sha=sha, kept=stats["kept"], patches=stats["patches_applied"]))

    print(f"upstream commit   {sha}")
    for key in ("files_rewritten", "renamed", "kept", "paths_renamed", "skipped_binary", "skipped_non_utf8", "patches_applied"):
        print(f"{key:<17} {stats[key]}")


if __name__ == "__main__":
    main()

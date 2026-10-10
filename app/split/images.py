"""Make iPhone photos readable.

A photo taken with the iPhone camera arrives over iMessage as HEIC. The runtime
only treats PNG, JPEG, GIF, BMP and WebP as images, so a HEIC receipt would
reach the model as an unreadable file. This turns it into a JPEG first.
"""
from __future__ import annotations

import io
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

HEIC_SUFFIXES = (".heic", ".heif")


def is_heic(path: str, media_type: str = "") -> bool:
    return str(path).lower().endswith(HEIC_SUFFIXES) or any(k in (media_type or "").lower() for k in ("heic", "heif"))


def heic_to_jpeg_bytes(path: str) -> Optional[bytes]:
    """JPEG bytes for a HEIC file, or None when it cannot be converted."""
    try:
        import pillow_heif
        from PIL import Image

        pillow_heif.register_heif_opener()
        with Image.open(path) as image:
            out = io.BytesIO()
            image.convert("RGB").save(out, format="JPEG", quality=90)
            return out.getvalue()
    except Exception:
        logger.debug("pillow could not read %s; trying sips", path, exc_info=True)
    try:  # macOS ships a converter
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "receipt.jpg"
            subprocess.run(["sips", "-s", "format", "jpeg", str(path), "--out", str(target)],
                           check=True, capture_output=True, timeout=30)
            return target.read_bytes()
    except Exception:
        logger.warning("could not convert HEIC image %s", path, exc_info=True)
        return None


def normalize_event_images(event) -> None:
    """Swap HEIC attachments on an inbound event for cached JPEG copies, in place."""
    urls, types = getattr(event, "media_urls", None) or [], getattr(event, "media_types", None)
    for index, url in enumerate(urls):
        kind = types[index] if types and index < len(types) else ""
        if not is_heic(url, kind):
            continue
        data = heic_to_jpeg_bytes(url)
        if not data:
            continue
        from gateway.platforms.base import cache_image_from_bytes  # runtime import

        urls[index] = cache_image_from_bytes(data, ".jpg")
        if types is not None and index < len(types):
            types[index] = "image/jpeg"

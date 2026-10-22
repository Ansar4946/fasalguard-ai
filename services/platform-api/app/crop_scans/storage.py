"""Read private media written by the NestJS LocalDiskStorageProvider (shared media volume)."""

import io
import os

from PIL import Image

from app.config import get_settings


class MediaUnavailable(Exception):
    pass


def read_private_object(object_key: str) -> bytes:
    base = os.path.realpath(get_settings().media_local_dir)
    path = os.path.realpath(os.path.join(base, object_key))
    if os.path.commonpath([base, path]) != base:
        raise MediaUnavailable("MEDIA_KEY_OUTSIDE_STORAGE")
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError as exc:
        raise MediaUnavailable("MEDIA_OBJECT_UNAVAILABLE") from exc


def to_clean_jpeg(image: Image.Image, max_side: int = 1024) -> bytes:
    """Re-encode for the provider: bounded size, no EXIF/GPS metadata leaves our system."""
    im = image.copy()
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=90)
    return buf.getvalue()

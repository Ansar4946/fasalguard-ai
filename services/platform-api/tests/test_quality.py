import io

import numpy as np
import pytest
from PIL import Image

from app.crop_scans import quality


def _png(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr.astype(np.uint8)).save(buf, format="PNG")
    return buf.getvalue()


def _leaf_like(w=480, h=480) -> np.ndarray:
    """Textured green/yellow-brown pattern: in focus, plant-coloured, mid brightness."""
    rng = np.random.default_rng(7)
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[..., 0] = 60 + 40 * rng.random((h, w))
    img[..., 1] = 120 + 60 * rng.random((h, w))
    img[..., 2] = 30 + 30 * rng.random((h, w))
    img[h // 3 : h // 2, w // 3 : w // 2] = [150, 110, 40]  # brown lesion
    return img


def test_black_image_rejected_too_dark_and_no_plant():
    q = quality.assess(quality.decode(_png(np.zeros((400, 400, 3)))))
    codes = {i["code"] for i in q.issues}
    assert not q.acceptable and {"TOO_DARK", "CROP_NOT_VISIBLE"} <= codes


def test_uniform_grey_rejected_blurry_and_no_plant():
    q = quality.assess(quality.decode(_png(np.full((400, 400, 3), 128))))
    codes = {i["code"] for i in q.issues}
    assert not q.acceptable and {"POSSIBLY_BLURRY", "CROP_NOT_VISIBLE"} <= codes


def test_overexposed_rejected():
    q = quality.assess(quality.decode(_png(np.full((400, 400, 3), 252))))
    assert "OVEREXPOSED" in {i["code"] for i in q.issues}


def test_leaf_like_image_accepted():
    q = quality.assess(quality.decode(_png(_leaf_like())))
    assert q.acceptable, q.issues
    assert q.metadata["method"] == "PIXEL_QUALITY_V2" and q.metadata["plantPixelFraction"] > 0.5


def test_blue_textured_image_rejected_as_crop_not_visible():
    rng = np.random.default_rng(1)
    arr = np.stack([30 + 40 * rng.random((400, 400)), 60 + 40 * rng.random((400, 400)), 160 + 60 * rng.random((400, 400))], -1)
    q = quality.assess(quality.decode(_png(arr)))
    assert "CROP_NOT_VISIBLE" in {i["code"] for i in q.issues}


@pytest.mark.parametrize(
    "raw,code",
    [
        (b"<html><script>alert(1)</script></html>", "CORRUPT_IMAGE"),
        (b"", "CORRUPT_IMAGE"),
        (b"\x00" * (quality.MAX_IMAGE_BYTES + 1), "IMAGE_TOO_LARGE"),
    ],
)
def test_decode_rejects_non_images(raw, code):
    with pytest.raises(quality.ImageRejected) as e:
        quality.decode(raw)
    assert e.value.code == code


def test_decode_rejects_small_images():
    with pytest.raises(quality.ImageRejected) as e:
        quality.decode(_png(_leaf_like(200, 200)))
    assert e.value.code == "IMAGE_DIMENSIONS_TOO_SMALL"


def test_decode_rejects_unsupported_format():
    buf = io.BytesIO()
    Image.fromarray(_leaf_like().astype(np.uint8)).save(buf, format="BMP")
    with pytest.raises(quality.ImageRejected) as e:
        quality.decode(buf.getvalue())
    assert e.value.code == "UNSUPPORTED_IMAGE_FORMAT"

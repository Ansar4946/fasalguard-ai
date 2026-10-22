import time

import jwt
import pytest

from app import auth
from app.crop_scans import policy
from app.errors import ApiError

SECRET = "unit-test-secret-unit-test-secret-0123456789"


@pytest.mark.parametrize(
    "cond,conf,expected",
    [
        ("Blast", 0.95, "SCREENING_COMPLETE"),
        ("Blast", 0.85, "SCREENING_COMPLETE"),
        ("Blast", 0.849, "EXPERT_REVIEW_RECOMMENDED"),
        ("Blast", 0.65, "EXPERT_REVIEW_RECOMMENDED"),
        ("Blast", 0.649, "BETTER_IMAGES_REQUIRED"),
        ("unknown", 0.99, "EXPERT_REVIEW_RECOMMENDED"),
        ("no_plant", 0.99, "EXPERT_REVIEW_RECOMMENDED"),
    ],
)
def test_disposition_thresholds(cond, conf, expected):
    assert policy.disposition(cond, conf, 0.65, 0.85) == expected


def test_status_mapping_and_disclaimer():
    assert policy.status_for("SCREENING_COMPLETE") == "DIAGNOSED"
    assert policy.status_for("EXPERT_REVIEW_RECOMMENDED") == "EXPERT_REVIEW"
    assert policy.status_for("BETTER_IMAGES_REQUIRED") == "NEEDS_FOLLOW_UP"
    assert "not a confirmed disease diagnosis" in policy.DISCLAIMER


def _tok(**over):
    claims = {"sub": "u1", "sid": "s1", "role": "FARMER", "type": "access", "iss": "fasalguard-api", "aud": "fasalguard-clients", "exp": int(time.time()) + 60}
    claims.update(over)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, over.pop("_key", SECRET) if "_key" in over else SECRET, algorithm="HS256")


def test_valid_access_token_decodes():
    assert auth.decode_access_token(_tok())["sid"] == "s1"


@pytest.mark.parametrize(
    "over",
    [{"iss": "other"}, {"aud": "other"}, {"type": "refresh"}, {"sid": None}, {"exp": int(time.time()) - 5}, {"exp": None}],
)
def test_invalid_claims_rejected(over):
    with pytest.raises(ApiError) as e:
        auth.decode_access_token(_tok(**over))
    assert e.value.status == 401


def test_wrong_signature_and_alg_none_rejected():
    bad = jwt.encode(
        {"sub": "u", "sid": "s", "type": "access", "iss": "fasalguard-api", "aud": "fasalguard-clients", "exp": int(time.time()) + 60},
        "wrong-key-wrong-key-wrong-key-0123",
        algorithm="HS256",
    )
    none = jwt.encode(
        {"sub": "u", "sid": "s", "type": "access", "iss": "fasalguard-api", "aud": "fasalguard-clients", "exp": int(time.time()) + 60}, None, algorithm="none"
    )
    for t in (bad, none):
        with pytest.raises(ApiError):
            auth.decode_access_token(t)


def test_missing_bearer_header():
    with pytest.raises(ApiError) as e:
        auth.current_principal(None)
    assert e.value.code == "AUTHENTICATION_REQUIRED"

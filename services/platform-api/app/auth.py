"""Authentication compatible with the NestJS JwtAuthGuard + RolesGuard.

Mirrors services/api/src/domain/auth/guards/jwt-auth.guard.ts exactly:
  1. HS256 signature with JWT_ACCESS_SECRET, issuer, audience, expiry;
  2. claims.type == "access";
  3. the session (claims.sid) is live: not revoked, not expired, user active and not deleted.
A revoked session is therefore rejected by both services.
"""

from dataclasses import dataclass

import jwt
from fastapi import Depends, Header
from sqlalchemy import text

from app.config import get_settings
from app.db import engine
from app.errors import ApiError


@dataclass(frozen=True)
class Principal:
    user_id: str
    session_id: str
    role: str


def _unauthorized() -> ApiError:
    return ApiError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired.")


def decode_access_token(token: str) -> dict:
    s = get_settings()
    try:
        claims = jwt.decode(
            token,
            s.jwt_access_secret,
            algorithms=["HS256"],
            issuer=s.jwt_issuer,
            audience=s.jwt_audience,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise _unauthorized() from exc
    if claims.get("type") != "access" or not claims.get("sid"):
        raise _unauthorized()
    return claims


def current_principal(authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "AUTHENTICATION_REQUIRED", "A valid bearer token is required.")
    claims = decode_access_token(authorization[7:])
    with engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT s.user_id::text, u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id "
                "WHERE s.id=:sid AND s.user_id=:sub AND s.revoked_at IS NULL AND s.expires_at>now() "
                "AND u.status='active' AND u.deleted_at IS NULL"
            ),
            {"sid": claims["sid"], "sub": claims["sub"]},
        ).first()
    if row is None:
        raise _unauthorized()
    return Principal(user_id=row[0], session_id=claims["sid"], role=row[1])


def require_roles(*roles: str):
    def _check(p: Principal = Depends(current_principal)) -> Principal:
        if p.role not in roles:
            raise ApiError(403, "INSUFFICIENT_ROLE", "Your role does not permit this action.")
        return p

    return _check

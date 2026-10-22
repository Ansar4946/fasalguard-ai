"""Error envelope identical to the NestJS ApiExceptionFilter: {"error": {code, message}, "meta": {...}}.

The web BFF (lib/auth/server-session.ts) reads body.error.code / body.error.message.
"""

from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.logging import log


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def _body(request: Request, code: str, message: str) -> dict:
    return {
        "error": {"code": code, "message": message},
        "meta": {
            "requestId": request.headers.get("x-request-id"),
            "timestamp": datetime.now(UTC).isoformat(),
            "path": request.url.path,
        },
    }


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return JSONResponse(_body(request, exc.code, exc.message), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        fields = sorted({".".join(str(p) for p in e.get("loc", [])[1:]) for e in exc.errors()})
        return JSONResponse(_body(request, "VALIDATION_FAILED", f"Invalid request: {', '.join(fields) or 'body'}."), status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(_body(request, code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(OperationalError)
    @app.exception_handler(InterfaceError)
    @app.exception_handler(PoolTimeoutError)
    async def _database_unavailable(request: Request, exc: Exception):
        """A database outage is a retryable 503, not an internal error (no connection details are exposed)."""
        log.error("database_unavailable", path=request.url.path, error_type=type(exc).__name__)
        return JSONResponse(_body(request, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Try again shortly."), status_code=503)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.error("unhandled_error", path=request.url.path, error_type=type(exc).__name__)
        return JSONResponse(_body(request, "INTERNAL_ERROR", "Something went wrong. Try again."), status_code=500)

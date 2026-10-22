"""platform-api: FastAPI service for the incremental migration from the NestJS API."""

import uuid

import redis
import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import db, errors
from app.config import get_settings
from app.crop_scans.router import router as crop_scans_router
from app.geometry.limits import GeometryBodyLimit
from app.geometry.router import router as geometry_router
from app.irrigation.router import router as irrigation_router
from app.logging import configure_logging, log
from app.offline.limits import OfflineBodyLimit
from app.offline.router import router as offline_router
from app.satellite.router import router as satellite_router
from app.weather.router import router as weather_router

settings = get_settings()
configure_logging(settings.log_level)
production = settings.environment == "production"
app = FastAPI(
    title="Fasal Guard platform-api",
    version="0.1.0",
    docs_url=None if production else "/api/v1/docs",
    redoc_url=None if production else "/redoc",
    openapi_url=None if production else "/api/v1/openapi.json",
)
errors.install(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex
    structlog.contextvars.bind_contextvars(request_id=rid, path=request.url.path, method=request.method)
    try:
        response = await call_next(request)
    finally:
        structlog.contextvars.clear_contextvars()
    response.headers["x-request-id"] = rid
    if not request.url.path.endswith(("/health", "/ready")):
        log.info("http_request", status=response.status_code, request_id=rid, path=request.url.path, method=request.method)
    return response


@app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok", "service": "platform-api"}


@app.get("/api/v1/ready")
def ready():
    try:
        ok = db.ping()
    except Exception:  # noqa: BLE001
        ok = False
    try:
        with redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=1) as client:
            cache_ok = bool(client.ping())
    except redis.RedisError:
        cache_ok = False
    healthy = ok and cache_ok
    return JSONResponse({"status": "ready" if healthy else "unavailable", "database": ok, "redis": cache_ok}, status_code=200 if healthy else 503)


app.include_router(crop_scans_router, prefix="/api/v1")
app.include_router(satellite_router, prefix="/api/v1")
app.include_router(irrigation_router, prefix="/api/v1")
app.include_router(weather_router, prefix="/api/v1")
app.include_router(geometry_router, prefix="/api/v1")
app.include_router(offline_router, prefix="/api/v1")
app.add_middleware(OfflineBodyLimit)
app.add_middleware(GeometryBodyLimit)
from app.irrigation.limits import IrrigationBodyLimit  # noqa: E402

app.add_middleware(IrrigationBodyLimit)

"""Runtime configuration. Every value comes from the environment; see docs/platform/ENVIRONMENT.md."""

from functools import lru_cache
from urllib.parse import parse_qs, urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", hide_input_in_errors=True)

    environment: str = Field("development", alias="NODE_ENV")
    database_url: str = Field(..., alias="DATABASE_URL")
    redis_url: str = Field("redis://redis:6379/0", alias="REDIS_URL")
    celery_broker_url: str = Field("redis://redis:6379/2", alias="PLATFORM_CELERY_BROKER_URL")
    log_level: str = Field("info", alias="LOG_LEVEL")
    # Disabled until credential verification and native/model release acceptance are complete.
    offline_sync_enabled: bool = Field(False, alias="OFFLINE_SYNC_ENABLED")

    # Identity is owned by the NestJS API; we verify the same access tokens and sessions.
    jwt_access_secret: str = Field(..., alias="JWT_ACCESS_SECRET", min_length=32)
    jwt_issuer: str = Field("fasalguard-api", alias="JWT_ISSUER")
    jwt_audience: str = Field("fasalguard-clients", alias="JWT_AUDIENCE")

    media_local_dir: str = Field("/data/media", alias="MEDIA_LOCAL_DIR")
    weather_provider: str = Field("open-meteo", alias="WEATHER_PROVIDER")
    open_meteo_api_key: str = Field("", alias="OPEN_METEO_API_KEY")
    weather_cache_ttl: int = Field(900, alias="WEATHER_CACHE_TTL_SECONDS", ge=60, le=3600)
    weather_max_stale: int = Field(3600, alias="WEATHER_MAX_STALE_SECONDS", ge=0, le=21600)
    irrigation_max_days: int = Field(180, alias="IRRIGATION_MAX_DAYS", ge=1, le=366)
    irrigation_run_limit: int = Field(10, alias="IRRIGATION_RUN_LIMIT_PER_HOUR", ge=1, le=100)
    irrigation_weather_timeout: float = Field(25, alias="IRRIGATION_WEATHER_TIMEOUT_SECONDS", gt=0, le=60)
    irrigation_weather_api_key: str = Field("", alias="IRRIGATION_WEATHER_API_KEY")
    wapor_enabled: bool = Field(False, alias="WAPOR_ENABLED")
    wapor_work_dir: str = Field("/data/wapor", alias="WAPOR_WORK_DIR")
    wapor_credentials_dir: str = Field("/run/secrets/pywapor", alias="WAPOR_CREDENTIALS_DIR")
    wapor_configuration: str = Field("WaPOR3_level_2", alias="WAPOR_CONFIGURATION")
    wapor_max_pixels: int = Field(250_000, alias="WAPOR_MAX_PIXELS", ge=1, le=1_000_000)

    satellite_max_pixels: int = Field(1_000_000, alias="SATELLITE_MAX_PIXELS", ge=100, le=4_000_000)
    satellite_scheduler_enabled: bool = Field(False, alias="SATELLITE_PLATFORM_ENABLED")

    # Vision (F01). Crop -> model registry is explicit: unknown crops are never sent to a model.
    roboflow_base_url: str = Field("https://serverless.roboflow.com", alias="ROBOFLOW_BASE_URL")
    roboflow_api_key: str = Field("", alias="ROBOFLOW_API_KEY")
    roboflow_wheat_model_id: str = Field("", alias="ROBOFLOW_WHEAT_MODEL_ID")
    roboflow_wheat_model_version: str = Field("", alias="ROBOFLOW_WHEAT_MODEL_VERSION")
    roboflow_rice_model_id: str = Field("", alias="ROBOFLOW_RICE_MODEL_ID")
    roboflow_rice_model_version: str = Field("", alias="ROBOFLOW_RICE_MODEL_VERSION")
    roboflow_cotton_model_id: str = Field("", alias="ROBOFLOW_COTTON_MODEL_ID")
    roboflow_cotton_model_version: str = Field("", alias="ROBOFLOW_COTTON_MODEL_VERSION")
    vision_timeout_seconds: float = Field(20.0, alias="VISION_TIMEOUT_SECONDS", gt=0, le=60)
    vision_minimum_confidence: float = Field(0.65, alias="VISION_MINIMUM_CONFIDENCE", ge=0, le=1)
    vision_expert_review_below: float = Field(0.85, alias="VISION_EXPERT_REVIEW_BELOW", ge=0, le=1)
    analyse_limit_per_hour: int = Field(10, alias="CROP_SCAN_ANALYSE_LIMIT_PER_HOUR", ge=1)

    # Service-to-service hand-off to NestJS for side effects it owns (field risk, lifecycle email).
    core_api_internal_url: str = Field("http://api:4000/api/v1", alias="CORE_API_INTERNAL_URL")
    internal_service_token: str = Field("", alias="INTERNAL_SERVICE_TOKEN")

    @model_validator(mode="after")
    def production_transport(self):
        if self.environment != "production":
            return self
        if self.offline_sync_enabled:
            raise ValueError("F06 production sync is blocked until credential verification and native/model acceptance are completed.")
        if len(self.jwt_access_secret) < 48:
            raise ValueError("Production JWT_ACCESS_SECRET requires at least 48 characters.")
        database = urlsplit(self.database_url)
        if database.scheme not in {"postgresql", "postgresql+psycopg2"} or parse_qs(database.query).get("sslmode") != ["verify-full"]:
            raise ValueError("Production DATABASE_URL requires PostgreSQL sslmode=verify-full.")
        for name, value in (("REDIS_URL", self.redis_url), ("PLATFORM_CELERY_BROKER_URL", self.celery_broker_url)):
            parsed = urlsplit(value)
            if parsed.scheme != "rediss" or parse_qs(parsed.query).get("ssl_cert_reqs", ["required"])[0].lower() not in {"required", "2"}:
                raise ValueError(f"Production {name} requires authenticated TLS verification.")
        if self.redis_url == self.celery_broker_url:
            raise ValueError("Platform cache and Celery broker must use distinct Redis namespaces.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

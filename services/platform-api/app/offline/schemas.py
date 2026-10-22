from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Prediction(Strict):
    modelVersionId: UUID
    modelSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    label: str = Field(min_length=1, max_length=200)
    score: float = Field(ge=0, le=1, strict=True)


class Capture(Strict):
    clientId: UUID
    fieldId: UUID
    cropSeasonId: UUID
    capturedAt: datetime
    imageSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    prediction: Prediction | None = None

    @field_validator("capturedAt")
    @classmethod
    def timestamp(cls, value):
        if value.tzinfo is None or value > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("Use a timezone-aware capture timestamp, not a future date.")
        return value.astimezone(UTC)


class Batch(Strict):
    captures: list[Capture] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique(self):
        if len({x.clientId for x in self.captures}) != len(self.captures):
            raise ValueError("Duplicate client IDs in one batch.")
        return self


class Manifest(Strict):
    modelVersionId: UUID
    modelId: str = Field(min_length=1, max_length=160)
    version: str = Field(min_length=1, max_length=80)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    cropId: UUID
    license: str = Field(min_length=1, max_length=200)
    evaluationReference: str = Field(min_length=1, max_length=500)
    runtime: Literal["onnx"]
    width: int = Field(ge=32, le=512, strict=True)
    height: int = Field(ge=32, le=512, strict=True)
    classes: list[str] = Field(min_length=2, max_length=200)
    mean: list[float] = Field(min_length=3, max_length=3)
    std: list[float] = Field(min_length=3, max_length=3)
    layout: Literal["NCHW"]
    output: Literal["logits", "probabilities"]
    resize: Literal["stretch"]

    @model_validator(mode="after")
    def validate_contract(self):
        if len(set(self.classes)) != len(self.classes) or any(not label or len(label) > 200 for label in self.classes):
            raise ValueError("Classes must be unique nonempty labels.")
        if any(v <= 0 for v in self.std):
            raise ValueError("Standard deviations must be positive.")
        return self

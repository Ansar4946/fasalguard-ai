"""Scientific input contracts. No crop/soil/weather values are invented."""

from datetime import date, timedelta
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    @model_validator(mode="before")
    @classmethod
    def numeric_booleans(cls, values):
        if isinstance(values, dict):
            for name, field in cls.model_fields.items():
                if field.annotation in (float, int) and isinstance(values.get(name), bool):
                    raise ValueError("A boolean is not a physical numeric measurement.")
        return values


class Parameters(Strict):
    Kcmini: float = Field(ge=0, le=2)
    Kcmmid: float = Field(gt=0, le=2)
    Kcmend: float = Field(ge=0, le=2)
    Kcbini: float = Field(ge=0, le=2)
    Kcbmid: float = Field(gt=0, le=2)
    Kcbend: float = Field(ge=0, le=2)
    Lini: int = Field(ge=1, le=180)
    Ldev: int = Field(ge=1, le=180)
    Lmid: int = Field(ge=1, le=180)
    Lend: int = Field(ge=1, le=180)
    hini: float = Field(gt=0, le=5)
    hmax: float = Field(gt=0, le=5)
    thetaFC: float = Field(gt=0, lt=0.8)
    thetaWP: float = Field(ge=0, lt=0.8)
    theta0: float = Field(ge=0, lt=0.8)
    Zrini: float = Field(ge=0.05, le=3)
    Zrmax: float = Field(ge=0.05, le=3)
    pbase: float = Field(gt=0, lt=1)
    Ze: float = Field(ge=0.01, le=0.3)
    REW: float = Field(gt=0, le=50)
    CN2: int = Field(ge=30, le=98)

    @model_validator(mode="after")
    def physical(self):
        if self.Kcbmid <= self.Kcbini or self.Kcbend > self.Kcbmid:
            raise ValueError("The supported crop curve requires basal mid-season coefficient > initial and end <= mid-season.")
        if not self.thetaWP < self.thetaFC or not self.thetaWP <= self.theta0 <= self.thetaFC:
            raise ValueError("Require wilting point <= initial water <= field capacity, with wilting point < field capacity.")
        if self.Zrini > self.Zrmax or self.hini > self.hmax or self.Ze > self.Zrini:
            raise ValueError("Root/height/evaporation depths are inconsistent.")
        if self.REW > 1000 * (self.thetaFC - 0.5 * self.thetaWP) * self.Ze:
            raise ValueError("Readily evaporable water cannot exceed total evaporable water.")
        if self.Lini + self.Ldev + self.Lmid + self.Lend > 366:
            raise ValueError("The supported annual upland cycle is at most366 days.")
        return self


class Profile(Strict):
    cropCycleId: UUID
    initialDate: date
    initialCondition: Literal["MEASURED", "SCENARIO"]
    source: str = Field(min_length=10, max_length=500)
    efficiency: float = Field(gt=0, le=1)
    wettedFraction: float = Field(gt=0, le=1)
    uplandNoGroundwater: Literal[True]
    parameters: Parameters
    expectedVersion: int = Field(ge=0)


class Event(Strict):
    cropCycleId: UUID
    date: date
    grossDepthMm: float = Field(gt=0, le=300)
    efficiency: float = Field(gt=0, le=1)
    wettedFraction: float = Field(gt=0, le=1)
    source: str = Field(min_length=5, max_length=300)
    idempotencyKey: UUID


class WeatherDay(Strict):
    date: date
    rainMm: float = Field(ge=0, le=1000)
    et0Mm: float = Field(ge=0, le=30)
    wind2mMs: float = Field(ge=0, le=60)
    rhMinPercent: float = Field(ge=0, le=100)


class Run(Strict):
    cropCycleId: UUID
    endDate: date
    weatherSource: Literal["OPEN_METEO_ARCHIVE", "MANUAL"]
    manualWeather: list[WeatherDay] | None = Field(None, min_length=1, max_length=366)
    source: str = Field(min_length=10, max_length=500)
    confirmedNoOtherIrrigation: Literal[True]
    idempotencyKey: UUID

    @model_validator(mode="after")
    def mode(self):
        if (self.weatherSource == "MANUAL") != (self.manualWeather is not None):
            raise ValueError("Manual weather is required only in manual mode.")
        return self


class Productivity(Strict):
    cropCycleId: UUID
    startDate: date
    endDate: date
    idempotencyKey: UUID
    dryMatterCarbonFraction: float = Field(ge=0.3, le=0.6)
    carbonFractionSource: str = Field(min_length=10, max_length=500)

    @model_validator(mode="after")
    def period(self):
        if self.endDate < self.startDate or self.endDate - self.startDate > timedelta(days=30):
            raise ValueError("Satellite processing supports ordered periods of at most31 days.")
        return self

"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { conditionLabel, groupHourlyByDay, pointCondition } from "@/features/weather/forecast-utils";
import { categoryLabel, suitabilityLabel, suitabilityTone, toneBadgeClass } from "@/features/weather/risk-labels";
import type {
  CurrentWeatherResponse,
  DaySummary,
  FieldOption,
  ForecastResponse,
  WeatherRisksResponse,
} from "@/features/weather/types";

interface WeatherBundle {
  current: CurrentWeatherResponse;
  forecast: ForecastResponse;
  risks: WeatherRisksResponse | null;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? "Could not load weather for this field right now.");
  }
  return body as T;
}

function fetchWeatherBundle(fieldId: string): Promise<WeatherBundle> {
  return Promise.all([
    fetch(`/api/fields/${fieldId}/weather/current`).then((response) => readJson<CurrentWeatherResponse>(response)),
    fetch(`/api/fields/${fieldId}/weather/forecast`).then((response) => readJson<ForecastResponse>(response)),
    fetch(`/api/fields/${fieldId}/weather/risks`)
      .then((response) => (response.ok ? (response.json() as Promise<WeatherRisksResponse>) : null))
      .catch(() => null),
  ]).then(([current, forecast, risks]) => ({ current, forecast, risks }));
}

export function WeatherIntelligence({ fields }: { fields: FieldOption[] }) {
  const [selectedFieldId, setSelectedFieldId] = useState(fields[0].id);
  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? fields[0];

  return (
    <div className="page-container space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.16em] text-success">
            <Icon name="weather" className="size-4" />
            Crop-aware forecast
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-brand-dark">Weather intelligence</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Live conditions and a multi-day outlook for your field, plus any weather-risk signals matched against
            crop rules for the active crop cycle.
          </p>
        </div>
        {fields.length > 1 && (
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Field
            <select
              value={selectedFieldId}
              onChange={(event) => setSelectedFieldId(event.target.value)}
              className="mt-2 h-11 w-full min-w-56 rounded-xl border border-border bg-white px-3 text-xs font-semibold normal-case tracking-normal text-foreground outline-none focus:border-brand"
            >
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name} — {field.farmName}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <WeatherPane key={selectedFieldId} field={selectedField} />
    </div>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; bundle: WeatherBundle };

function WeatherPane({ field }: { field: FieldOption }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    // setState only ever happens inside these async callbacks, never synchronously in the
    // effect body — `key={selectedFieldId}` on the caller remounts this component (and its
    // "loading" initial state) on field change, and retry() below sets "loading" itself
    // before bumping retryToken, so this effect never needs to setState eagerly.
    let active = true;
    fetchWeatherBundle(field.id)
      .then((bundle) => {
        if (active) setState({ status: "ready", bundle });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Could not load weather for this field right now.",
          });
      });
    return () => {
      active = false;
    };
  }, [field.id, retryToken]);

  function retry() {
    setState({ status: "loading" });
    setRetryToken((value) => value + 1);
  }

  if (state.status === "loading") return <LoadingCard label="Loading the latest forecast…" />;
  if (state.status === "error") return <ErrorCard message={state.message} onRetry={retry} />;

  const { current, forecast, risks } = state.bundle;
  const days = groupHourlyByDay(forecast.hourly);
  const today = days.find((day) => day.label === "Today") ?? days[0] ?? null;
  const point = current.weather;
  const condition = conditionLabel(pointCondition(point));

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <article className="overflow-hidden rounded-[20px] bg-brand p-6 text-white shadow-[0_18px_50px_rgba(11,81,55,.18)]">
          <div className="flex flex-col gap-5 sm:flex-row sm:justify-between">
            <div>
              <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-bold">
                {field.growthStage ? `Growth stage: ${field.growthStage}` : "No active crop cycle"}
              </span>
              <h2 className="mt-5 text-5xl font-extrabold">{formatValue(point.temperatureC, "°C", 0)}</h2>
              <p className="mt-2 text-sm text-white/75">
                {condition} · {field.name}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:w-64">
              <Metric label="Humidity" value={formatValue(point.relativeHumidityPercent, "%", 0)} />
              <Metric label="Rain chance" value={formatValue(today?.maxRainProbabilityPercent ?? point.precipitationProbabilityPercent, "%", 0)} />
              <Metric label="Wind" value={formatValue(point.windSpeedKph, " km/h", 0)} />
              <Metric
                label="Soil moisture"
                value={point.soilMoistureM3M3 != null ? formatValue(point.soilMoistureM3M3 * 100, "%", 0) : "Not available"}
              />
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-white/10 p-4">
            <div className="flex items-center justify-between">
              <strong>Crop-weather suitability</strong>
              {risks?.assessment ? (
                <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${toneBadgeClass(suitabilityTone(risks.assessment))}`}>
                  {suitabilityLabel(risks.assessment)}
                </span>
              ) : (
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white/80">Not assessed</span>
              )}
            </div>
            <p className="mt-3 text-sm leading-6 text-white/80">
              {risks?.matches[0]?.message ??
                risks?.disclaimer ??
                "Set an active crop cycle for this field to see crop-specific weather suitability."}
            </p>
          </div>
        </article>

        <article className="card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Field context</p>
          <h2 className="mt-2 text-xl font-extrabold">{field.name}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <Context label="Farm" value={field.farmName} />
            <Context label="Crop cycle" value={field.cropCycleStatus ?? "Not set"} />
            <Context label="Growth stage" value={field.growthStage ?? "Not set"} />
            <Context label="Soil" value={field.soilType ?? "Not set"} />
          </dl>
          <div className="mt-5 rounded-xl bg-brand-soft p-4 text-xs leading-5 text-brand-dark">
            <strong>Provider:</strong> {current.provider === "OPEN_METEO" ? "Open-Meteo" : "OpenWeatherMap"} · updated{" "}
            {new Date(current.observedAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}
          </div>
        </article>
      </section>

      <RiskSignals risks={risks} />

      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-extrabold">{days.length}-day outlook</h2>
            <p className="mt-1 text-xs text-muted">Grouped from the live hourly forecast for {field.name}.</p>
          </div>
        </div>
        {days.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-white px-4 py-3 text-xs text-muted">
            No forecast data is available for this field right now.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {days.map((day) => (
              <DayCard key={day.key} day={day} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function DayCard({ day }: { day: DaySummary }) {
  const badgeClass =
    day.condition === "rain-likely"
      ? "bg-red-100 text-danger"
      : day.condition === "chance-of-rain"
        ? "bg-amber-100 text-amber-900"
        : "bg-green-100 text-success";
  return (
    <article className="card min-w-0 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-extrabold">{day.label}</h3>
          <p className="text-[10px] text-muted">{day.dateLabel}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[8px] font-extrabold uppercase ${badgeClass}`}>{conditionLabel(day.condition)}</span>
      </div>
      <p className="mt-4 text-lg font-extrabold">
        {day.lowC != null && day.highC != null ? `${Math.round(day.lowC)}–${Math.round(day.highC)}°` : "—"}
      </p>
      <div className="mt-3 space-y-1 text-[10px] text-muted">
        <p>
          Rain {day.maxRainProbabilityPercent ?? "—"}% · Humidity {day.avgHumidityPercent ?? "—"}%
        </p>
        <p>Wind {day.maxWindKph ?? "—"} km/h</p>
      </div>
    </article>
  );
}

function RiskSignals({ risks }: { risks: WeatherRisksResponse | null }) {
  if (!risks) return null;
  return (
    <section>
      <h2 className="text-xl font-extrabold">Weather risk signals</h2>
      <p className="mt-1 text-xs text-muted">{risks.disclaimer}</p>
      {risks.matches.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-brand/15 bg-surface-soft p-5 text-center text-xs text-muted">
          No crop-weather risk rules have matched current conditions for this field.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {risks.matches.map((match) => (
            <article key={match.id} className={`card border-l-4 p-5 ${match.isExpertApproved ? "border-l-info" : "border-l-warning"}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-extrabold">{categoryLabel(match.category)}</h3>
                <span className={`rounded px-2 py-1 text-[8px] font-bold uppercase ${toneBadgeClass(suitabilityTone(match.suitability))}`}>
                  {suitabilityLabel(match.suitability)}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5">{match.message}</p>
              <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-muted">
                {match.isExpertApproved ? "Expert-approved rule" : "Demo rule · illustrative only"}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-40 items-center justify-center rounded-3xl border border-dashed border-brand/15 bg-white/40 text-sm font-semibold text-muted">
      {label}
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-3xl border border-danger/20 bg-danger/5 p-6 text-center">
      <p className="text-sm font-semibold text-danger">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-10 rounded-xl border border-danger/30 bg-white px-5 text-xs font-bold text-danger"
      >
        Try again
      </button>
    </div>
  );
}

function formatValue(value: number | null | undefined, unit: string, digits: number): string {
  return typeof value === "number" ? `${value.toFixed(digits)}${unit}` : "—";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <p className="text-[9px] text-white/60">{label}</p>
      <p className="mt-1 text-sm font-extrabold">{value}</p>
    </div>
  );
}

function Context({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-soft p-3">
      <dt className="text-[9px] uppercase text-muted">{label}</dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}

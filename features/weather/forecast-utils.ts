import type { DayCondition, DaySummary, WeatherPoint } from "./types";

const DAY_MS = 86_400_000;

/** Groups hourly forecast points into calendar-day summaries using the point's own `time` value. */
export function groupHourlyByDay(hourly: WeatherPoint[]): DaySummary[] {
  const buckets = new Map<string, WeatherPoint[]>();
  for (const point of hourly) {
    const date = new Date(point.time);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }
  const todayKey = dayKey(new Date());
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, points]) => summarizeDay(key, points, todayKey));
}

/** Derives a simple rain-based condition for a single point (used for the "current" card). */
export function pointCondition(point: WeatherPoint): DayCondition {
  return conditionFrom(point.precipitationProbabilityPercent, point.precipitationMm);
}

export function conditionLabel(condition: DayCondition): string {
  if (condition === "rain-likely") return "Rain likely";
  if (condition === "chance-of-rain") return "Chance of rain";
  return "Clear";
}

function summarizeDay(key: string, points: WeatherPoint[], todayKey: string): DaySummary {
  const temps = numbers(points, "temperatureC");
  const humidity = numbers(points, "relativeHumidityPercent");
  const wind = numbers(points, "windSpeedKph");
  const rainProbability = numbers(points, "precipitationProbabilityPercent");
  const precipitation = numbers(points, "precipitationMm");

  const totalPrecipitationMm = precipitation.length ? round1(sum(precipitation)) : null;
  const maxRainProbabilityPercent = rainProbability.length ? Math.max(...rainProbability) : null;
  const dayDate = new Date(`${key}T00:00:00`);
  const delta = dayDelta(todayKey, key);

  return {
    key,
    label: delta === 0 ? "Today" : delta === 1 ? "Tomorrow" : dayDate.toLocaleDateString(undefined, { weekday: "short" }),
    dateLabel: dayDate.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    highC: temps.length ? round1(Math.max(...temps)) : null,
    lowC: temps.length ? round1(Math.min(...temps)) : null,
    avgHumidityPercent: humidity.length ? Math.round(avg(humidity)) : null,
    maxWindKph: wind.length ? round1(Math.max(...wind)) : null,
    maxRainProbabilityPercent,
    totalPrecipitationMm,
    condition: conditionFrom(maxRainProbabilityPercent, totalPrecipitationMm),
  };
}

function conditionFrom(rainProbabilityPercent: number | null, precipitationMm: number | null): DayCondition {
  if ((rainProbabilityPercent ?? 0) >= 60 || (precipitationMm ?? 0) >= 2) return "rain-likely";
  if ((rainProbabilityPercent ?? 0) >= 30 || (precipitationMm ?? 0) > 0) return "chance-of-rain";
  return "clear";
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayDelta(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`).getTime();
  const to = new Date(`${toKey}T00:00:00`).getTime();
  return Math.round((to - from) / DAY_MS);
}

function numbers(points: WeatherPoint[], field: keyof WeatherPoint): number[] {
  return points.map((point) => point[field]).filter((value): value is number => typeof value === "number");
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function avg(values: number[]): number {
  return sum(values) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

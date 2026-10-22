import Link from "next/link";
import { authenticatedJson } from "@/lib/auth/server-session";
import { forecastDays } from "@/features/weather/forecast-utils";
import type { DayCondition, ForecastResponse, WeatherPoint } from "@/features/weather/types";

const barColor: Record<DayCondition, string> = {
  unknown: "bg-muted",
  clear: "bg-success",
  "chance-of-rain": "bg-info",
  "rain-likely": "bg-warning",
};

/**
 * Streams in separately from the rest of the dashboard: the forecast may need a provider round
 * trip on a cold cache, and a provider outage must not take the whole home screen down.
 */
export async function DashboardWeather({ field }: { field: { id: string; name: string } | null }) {
  if (!field) {
    return (
      <WeatherShell>
        <p className="mt-4 text-xs leading-5 text-muted">Add a field to see its 7-day forecast.</p>
      </WeatherShell>
    );
  }
  const { response, body } = await authenticatedJson<ForecastResponse>(`/fields/${field.id}/weather/forecast`, {}, process.env.WEATHER_PLATFORM_ENABLED === "true" ? "platform" : "core").catch(() => ({
    response: null,
    body: null,
  }));
  const hourly = response?.ok && Array.isArray(body?.hourly) ? body.hourly : [];
  if (!hourly.length) {
    return (
      <WeatherShell fieldName={field.name}>
        <p className="mt-4 text-xs leading-5 text-muted">Weather data is temporarily unavailable. Try again shortly.</p>
      </WeatherShell>
    );
  }
  const days = forecastDays(body!).slice(0, 7);
  const now = closestToNow(hourly);
  return (
    <WeatherShell fieldName={field.name}>
      <div className="mt-5 flex h-36 items-end justify-between gap-2" role="img" aria-label="Daily chance of rain for the next 7 days">
        {days.map((day) => (
          <div key={day.key} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[8px] font-bold text-muted">{day.maxRainProbabilityPercent == null ? "N/A" : `${day.maxRainProbabilityPercent}%`}</span>
            <span
              className={`w-2.5 rounded-full ${barColor[day.condition]}`}
              style={{ height: `${Math.max(6, day.maxRainProbabilityPercent ?? 0)}px` }}
              title={`${day.label}: ${day.lowC ?? "–"}–${day.highC ?? "–"}°C`}
            />
            <span className="text-[9px] font-bold text-muted">{day.label === "Tomorrow" ? "Tmrw" : day.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[9px] text-muted">Daily chance of rain ? {body?.freshness ?? "Freshness unknown"}</p>
      <div className="mt-3 grid grid-cols-3 border-t border-border pt-3 text-center">
        <Small label="Now" value={formatValue(now?.temperatureC, "°C")} />
        <Small label="Humidity" value={formatValue(now?.relativeHumidityPercent, "%")} />
        <Small label="Rain" value={formatValue(now?.precipitationProbabilityPercent, "%")} />
      </div>
    </WeatherShell>
  );
}

function WeatherShell({ fieldName, children }: { fieldName?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">7-Day Weather Outlook</h2>
        <Link href="/weather" className="text-[11px] font-bold text-brand">Details →</Link>
      </div>
      {fieldName && <p className="mt-1 text-[10px] text-muted">{fieldName}</p>}
      {children}
    </section>
  );
}

export function DashboardWeatherSkeleton() {
  return (
    <section className="animate-pulse rounded-2xl border border-border bg-white p-5 shadow-sm" aria-busy="true">
      <div className="h-4 w-40 rounded bg-brand/10" />
      <div className="mt-5 h-36 rounded-xl bg-brand/5" />
      <span className="sr-only">Loading weather…</span>
    </section>
  );
}

function closestToNow(points: WeatherPoint[]): WeatherPoint | undefined {
  const now = Date.now();
  let best: WeatherPoint | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const gap = Math.abs(new Date(point.time).getTime() - now);
    if (gap < bestGap) {
      best = point;
      bestGap = gap;
    }
  }
  return best;
}

function formatValue(value: number | null | undefined, unit: string): string {
  return typeof value === "number" ? `${Math.round(value)}${unit}` : "–";
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] uppercase text-muted">{label}</p>
      <strong className="text-[10px]">{value}</strong>
    </div>
  );
}

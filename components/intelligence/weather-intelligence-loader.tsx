"use client";

import dynamic from "next/dynamic";
import type { FieldOption } from "@/features/weather/types";

// WeatherIntelligence fetches from relative /api/... URLs, which only resolve in
// the browser (Node's fetch during SSR needs an absolute URL). Loading it client-only
// avoids that SSR failure entirely, matching this app's existing pattern for other
// browser-only widgets (see components/farms/boundary-picker.tsx).
const WeatherIntelligence = dynamic(
  () => import("./weather-intelligence").then((mod) => mod.WeatherIntelligence),
  { ssr: false, loading: () => <LoadingPlaceholder /> },
);

function LoadingPlaceholder() {
  return (
    <div className="page-container">
      <div
        role="status"
        className="flex min-h-40 items-center justify-center rounded-3xl border border-dashed border-brand/15 bg-white/40 text-sm font-semibold text-muted"
      >
        Loading the latest forecast…
      </div>
    </div>
  );
}

export function WeatherIntelligenceLoader({ fields }: { fields: FieldOption[] }) {
  return <WeatherIntelligence fields={fields} />;
}

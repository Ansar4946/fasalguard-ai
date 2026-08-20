"use client";

import dynamic from "next/dynamic";
import type { GeoJsonPolygon } from "@/lib/geo/polygon";
import type { StressZoneMapItem } from "./satellite-map-inner";

const SatelliteMapInner = dynamic(() => import("./satellite-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse rounded-[20px] bg-black/5" aria-hidden="true" />
  ),
});

export function SatelliteMap({
  boundary,
  zones,
  selectedZoneId,
  onSelectZone,
}: {
  boundary: GeoJsonPolygon;
  zones: StressZoneMapItem[];
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
}) {
  return (
    <SatelliteMapInner
      boundary={boundary}
      zones={zones}
      selectedZoneId={selectedZoneId}
      onSelectZone={onSelectZone}
    />
  );
}

"use client";

import dynamic from "next/dynamic";
import type { DashboardFarmPoint, DashboardOutbreak } from "@/features/dashboard/types";

const OutbreakRadarMapInner = dynamic(() => import("./outbreak-radar-map-inner"), {
  ssr: false,
  loading: () => <div className="h-[370px] w-full animate-pulse bg-black/5" aria-hidden="true" />,
});

export function OutbreakRadarMap(props: {
  farms: DashboardFarmPoint[];
  outbreaks: DashboardOutbreak[];
  radiusKm: number;
}) {
  return <OutbreakRadarMapInner {...props} />;
}

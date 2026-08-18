"use client";

import dynamic from "next/dynamic";
import type { GeoJsonPolygon } from "@/lib/geo/polygon";

const BoundaryPreviewInner = dynamic(() => import("./boundary-preview-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] w-full animate-pulse rounded-xl bg-black/5" aria-hidden="true" />
  ),
});

export function BoundaryPreview({ boundary }: { boundary: GeoJsonPolygon }) {
  return <BoundaryPreviewInner boundary={boundary} />;
}

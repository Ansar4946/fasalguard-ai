"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer } from "react-leaflet";
import { fromGeoJsonPolygon, type GeoJsonPolygon } from "@/lib/geo/polygon";

export interface StressZoneMapItem {
  id: string;
  label: string;
  severity: "LOW" | "MODERATE" | "HIGH";
  score: number;
  areaHectares: number;
  geometry: GeoJsonPolygon;
}

const severityColor: Record<StressZoneMapItem["severity"], string> = {
  LOW: "#2f7d32",
  MODERATE: "#a25c00",
  HIGH: "#c5352e",
};

export default function SatelliteMapInner({
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
  const points = fromGeoJsonPolygon(boundary);
  if (points.length < 3) return null;
  const center = points.reduce<[number, number]>(
    (sum, [lat, lng]) => [sum[0] + lat / points.length, sum[1] + lng / points.length],
    [0, 0],
  );
  return (
    <MapContainer center={center} zoom={16} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polygon positions={points} pathOptions={{ color: "#075f3d", fillOpacity: 0.05, weight: 2 }} />
      {zones.map((zone) => {
        const zonePoints = fromGeoJsonPolygon(zone.geometry);
        if (zonePoints.length < 3) return null;
        const zoneCenter = zonePoints.reduce<[number, number]>(
          (sum, [lat, lng]) => [sum[0] + lat / zonePoints.length, sum[1] + lng / zonePoints.length],
          [0, 0],
        );
        const color = severityColor[zone.severity];
        const selected = zone.id === selectedZoneId;
        return (
          <div key={zone.id}>
            <Polygon
              positions={zonePoints}
              pathOptions={{ color, fillOpacity: selected ? 0.45 : 0.25, weight: selected ? 3 : 1.5 }}
              eventHandlers={{ click: () => onSelectZone(zone.id) }}
            />
            <CircleMarker
              center={zoneCenter}
              radius={selected ? 9 : 7}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 1 }}
              eventHandlers={{ click: () => onSelectZone(zone.id) }}
            >
              <Popup>
                <strong>{zone.label.replace(/_/g, " ")}</strong>
                <br />
                {zone.areaHectares.toFixed(2)} ha · score {zone.score.toFixed(0)}
              </Popup>
            </CircleMarker>
          </div>
        );
      })}
    </MapContainer>
  );
}

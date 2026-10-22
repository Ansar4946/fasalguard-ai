"use client";

import "leaflet/dist/leaflet.css";
import { Circle, CircleMarker, MapContainer, Polygon, TileLayer, Tooltip } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { fromGeoJsonPolygon } from "@/lib/geo/polygon";
import type { DashboardFarmPoint, DashboardOutbreak } from "@/features/dashboard/types";

const confirmedStatuses = new Set(["CONFIRMED", "EXPERT_REVIEW", "SUSPECTED"]);

export default function OutbreakRadarMapInner({
  farms,
  outbreaks,
  radiusKm,
}: {
  farms: DashboardFarmPoint[];
  outbreaks: DashboardOutbreak[];
  radiusKm: number;
}) {
  const areas = outbreaks.map((outbreak) => ({ outbreak, points: fromGeoJsonPolygon(outbreak.geometry) }));
  const bounds = [
    ...farms.map((farm) => [farm.latitude, farm.longitude] as [number, number]),
    ...areas.flatMap((area) => area.points),
  ];
  if (!bounds.length) return null;

  return (
    <MapContainer
      bounds={bounds as LatLngBoundsExpression}
      boundsOptions={{ padding: [40, 40], maxZoom: 12 }}
      scrollWheelZoom={false}
      style={{ height: "370px", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {farms.map((farm) => (
        <Circle
          key={`radius-${farm.id}`}
          center={[farm.latitude, farm.longitude]}
          radius={radiusKm * 1000}
          pathOptions={{ color: "#166534", weight: 1, dashArray: "4 6", fillOpacity: 0.03 }}
        />
      ))}
      {areas.map(({ outbreak, points }) => {
        const color = confirmedStatuses.has(outbreak.status) ? "#dc2626" : "#d97706";
        return (
          <Polygon key={outbreak.id} positions={points} pathOptions={{ color, fillOpacity: 0.25 }}>
            <Tooltip>
              {outbreak.crop} · {outbreak.conditionFamily} ({outbreak.distanceKm} km)
            </Tooltip>
          </Polygon>
        );
      })}
      {farms.map((farm) => (
        <CircleMarker
          key={farm.id}
          center={[farm.latitude, farm.longitude]}
          radius={9}
          pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#166534", fillOpacity: 1 }}
        >
          <Tooltip>{farm.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

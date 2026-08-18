"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, Polygon, TileLayer } from "react-leaflet";
import { fromGeoJsonPolygon, type GeoJsonPolygon } from "@/lib/geo/polygon";

export default function BoundaryPreviewInner({ boundary }: { boundary: GeoJsonPolygon }) {
  const points = fromGeoJsonPolygon(boundary);
  if (points.length < 3) return null;
  const center = points.reduce<[number, number]>(
    (sum, [lat, lng]) => [sum[0] + lat / points.length, sum[1] + lng / points.length],
    [0, 0],
  );
  return (
    <MapContainer
      center={center}
      zoom={15}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      style={{ height: "260px", width: "100%", borderRadius: "12px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polygon positions={points} pathOptions={{ color: "#166534", fillOpacity: 0.2 }} />
    </MapContainer>
  );
}

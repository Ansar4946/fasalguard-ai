"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";

interface BoundaryMapInnerProps {
  center: [number, number];
  points: [number, number][];
  onAddPoint: (point: [number, number]) => void;
}

function ClickCapture({ onAdd }: { onAdd: (point: [number, number]) => void }) {
  useMapEvents({
    click(event) {
      onAdd([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

/** MapContainer's `center` prop only applies at mount — recenter explicitly when a search result changes it. */
function RecenterOnChange({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1]]);
  return null;
}

/**
 * Leaflet measures its container's size when it mounts. Inside a dialog/scroll
 * container that's still settling its layout, that measurement can be stale,
 * which silently shifts every click's computed lat/lng. Re-measuring on the
 * next couple of frames (and on window resize) keeps clicks accurate.
 */
function SizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      map.invalidateSize();
      requestAnimationFrame(() => map.invalidateSize());
    });
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}

export default function BoundaryMapInner({ center, points, onAddPoint }: BoundaryMapInnerProps) {
  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{ height: "320px", width: "100%", borderRadius: "12px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <SizeInvalidator />
      <RecenterOnChange center={center} />
      <ClickCapture onAdd={onAddPoint} />
      {points.map((point, index) => (
        <CircleMarker
          key={`${point[0]}-${point[1]}-${index}`}
          center={point}
          radius={5}
          pathOptions={{ color: "#166534", fillColor: "#22c55e", fillOpacity: 1, weight: 2 }}
        />
      ))}
      {points.length >= 3 && (
        <Polygon positions={points} pathOptions={{ color: "#166534", fillOpacity: 0.18 }} />
      )}
    </MapContainer>
  );
}

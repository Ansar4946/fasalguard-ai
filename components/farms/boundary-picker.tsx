"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

const BoundaryMapInner = dynamic(() => import("./boundary-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-xl bg-black/5" aria-hidden="true" />
  ),
});

const DEFAULT_CENTER: [number, number] = [30.1575, 71.5249]; // Multan, Punjab

interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

interface BoundaryPickerProps {
  points: [number, number][];
  onChange: (points: [number, number][]) => void;
  center?: [number, number];
}

export function BoundaryPicker({ points, onChange, center = DEFAULT_CENTER }: BoundaryPickerProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const addPoint = useCallback(
    (point: [number, number]) => onChange([...points, point]),
    [points, onChange],
  );
  const undo = useCallback(() => onChange(points.slice(0, -1)), [points, onChange]);
  const clear = useCallback(() => onChange([]), [onChange]);

  return (
    <div className="space-y-2">
      <LocationSearch onSelect={(result) => setMapCenter([result.lat, result.lng])} />
      <BoundaryMapInner center={mapCenter} points={points} onAddPoint={addPoint} />
      <div className="flex items-center justify-between gap-3 text-[10px]">
        <p className="text-muted">
          Search for your farm&apos;s location, then tap the map to place each corner of the boundary, in order.{" "}
          {points.length < 3
            ? `${3 - points.length} more point${points.length === 2 ? "" : "s"} needed.`
            : `${points.length} points placed — ready to save.`}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={points.length === 0}
            className="rounded-md border border-brand/15 px-2 py-1 font-bold text-brand-dark disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={points.length === 0}
            className="rounded-md border border-brand/15 px-2 py-1 font-bold text-brand-dark disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function LocationSearch({ onSelect }: { onSelect: (result: GeocodeResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return;
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      setStatus("loading");
      fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`)
        .then((response) => response.json())
        .then((body: { results?: GeocodeResult[] }) => {
          if (requestId.current !== id) return;
          setResults(body.results ?? []);
          setStatus("idle");
          setOpen(true);
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setResults([]);
          setStatus("error");
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const showDropdown = open && query.trim().length >= 3 && results.length > 0;

  function select(result: GeocodeResult) {
    onSelect(result);
    setQuery(result.label);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor="location-search" className="sr-only">
        Search for a place to center the map
      </label>
      <input
        id="location-search"
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search for your village, town, or address…"
        className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand"
        autoComplete="off"
      />
      {status === "error" && (
        <p className="mt-1 text-[9px] font-semibold text-danger">Location search is temporarily unavailable.</p>
      )}
      {showDropdown && (
        <ul className="absolute z-[500] mt-1 w-full overflow-hidden rounded-lg border border-[#ccd6cf] bg-white text-[11px] shadow-lg">
          {results.map((result) => (
            <li key={`${result.lat}-${result.lng}`}>
              <button
                type="button"
                onClick={() => select(result)}
                className="block w-full px-3 py-2 text-left hover:bg-brand-soft"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeGeolocationError } from "@/lib/geo/geolocation";

const BoundaryMapInner = dynamic(() => import("./boundary-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-xl bg-black/5" aria-hidden="true" />
  ),
});

const DEFAULT_CENTER: [number, number] = [30.1575, 71.5249]; // Multan, Punjab

interface GeocodeResult {
  label: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  type?: string;
  lat: number;
  lng: number;
}

interface ResolvedLocation {
  province: string | null;
  district: string | null;
  tehsil: string | null;
}

interface BoundaryPickerProps {
  points: [number, number][];
  onChange: (points: [number, number][]) => void;
  center?: [number, number];
  onLocationResolved?: (result: ResolvedLocation) => void;
}

async function reverseGeocode(lat: number, lng: number): Promise<ResolvedLocation | null> {
  try {
    const response = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lng}`);
    if (!response.ok) return null;
    return (await response.json()) as ResolvedLocation;
  } catch {
    return null;
  }
}

export function BoundaryPicker({
  points,
  onChange,
  center = DEFAULT_CENTER,
  onLocationResolved,
}: BoundaryPickerProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const addPoint = useCallback(
    (point: [number, number]) => onChange([...points, point]),
    [points, onChange],
  );
  const undo = useCallback(() => onChange(points.slice(0, -1)), [points, onChange]);
  const clear = useCallback(() => onChange([]), [onChange]);

  async function moveTo(lat: number, lng: number): Promise<void> {
    setMapCenter([lat, lng]);
    // Best-effort — a farmer can always type the address fields by hand if this fails.
    const resolved = await reverseGeocode(lat, lng);
    if (resolved) onLocationResolved?.(resolved);
  }

  return (
    <div className="space-y-2">
      <LocationSearch onSelect={(result) => moveTo(result.lat, result.lng)} onUseCurrentLocation={moveTo} />
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

function LocationSearch({
  onSelect,
  onUseCurrentLocation,
}: {
  onSelect: (result: GeocodeResult) => void;
  onUseCurrentLocation: (lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const requestId = useRef(0);

  function useCurrentLocation(): void {
    if (!("geolocation" in navigator)) {
      setLocateError("Your browser doesn't support location detection.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onUseCurrentLocation(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setLocating(false);
        setLocateError(describeGeolocationError(error));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

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
  const showEmpty = open && status === "idle" && query.trim().length >= 3 && results.length === 0;

  function select(result: GeocodeResult) {
    onSelect(result);
    setQuery(result.label);
    setOpen(false);
  }

  return (
    <div className="flex items-start gap-2">
      <div className="relative min-w-0 flex-1">
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
        {locateError && (
          <p className="mt-1 text-[9px] font-semibold text-danger">{locateError}</p>
        )}
        {showDropdown && (
          <ul className="absolute z-[500] mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-[#ccd6cf] bg-white p-1 text-[11px] shadow-xl">
            {results.map((result) => (
              <li key={`${result.lat}-${result.lng}`}>
                <button
                  type="button"
                  onClick={() => select(result)}
                  className="flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-brand-soft focus:bg-brand-soft focus:outline-none"
                >
                  <span aria-hidden="true" className="mt-0.5 text-brand">●</span>
                  <span className="min-w-0">
                    <strong className="block truncate text-[11px] text-brand-dark">
                      {result.primaryLabel ?? result.label}
                    </strong>
                    <span className="mt-0.5 block truncate text-[9px] text-muted">
                      {result.secondaryLabel ?? result.label}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {showEmpty && (
          <div className="absolute z-[500] mt-1 w-full rounded-xl border border-[#ccd6cf] bg-white px-3 py-3 text-[10px] text-muted shadow-xl">
            No exact match found. Try the nearest village, road, union council, or add “Lahore, Pakistan”.
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={locating}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-[10px] font-bold text-brand-dark hover:bg-brand-soft disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
        {locating ? "Locating…" : "Use my location"}
      </button>
    </div>
  );
}

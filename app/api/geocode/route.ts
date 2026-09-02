import { NextResponse } from "next/server";

interface GeoapifyResult {
  lat: number;
  lon: number;
  formatted: string;
  address_line1?: string;
  address_line2?: string;
  result_type?: string;
  rank?: { confidence?: number };
}

interface GeoapifyResponse {
  results?: GeoapifyResult[];
}

interface GoogleGeocodeResult {
  formatted_address: string;
  geometry: { location: { lat: number; lng: number }; location_type?: string };
  types?: string[];
}

interface GoogleGeocodeResponse {
  status: string;
  results?: GoogleGeocodeResult[];
}

async function searchGoogle(query: string, apiKey: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("components", "country:PK");
  url.searchParams.set("region", "pk");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return null;
  const body = (await response.json()) as GoogleGeocodeResponse;
  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") return null;
  return (body.results ?? []).slice(0, 8).map((result) => {
    const [primaryLabel, ...secondary] = result.formatted_address.split(",");
    return {
      label: result.formatted_address,
      primaryLabel,
      secondaryLabel: secondary.join(",").trim() || "Pakistan",
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      type: result.types?.[0] ?? result.geometry.location_type ?? "place",
      confidence: null,
      provider: "google",
    };
  });
}

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!googleApiKey && !apiKey)
    return NextResponse.json(
      { error: { message: "Location search is not configured." } },
      { status: 503 },
    );

  if (googleApiKey) {
    try {
      const results = await searchGoogle(query, googleApiKey);
      if (results?.length) return NextResponse.json({ results });
    } catch {
      // Fall through to Geoapify so one provider outage does not block boundary mapping.
    }
  }

  if (!apiKey) return NextResponse.json({ results: [] });

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  // Supplying Pakistan explicitly improves local village/road matching and avoids
  // Geoapify ranking results using the server's deployment-region IP address.
  url.searchParams.set("text", `${query}, Pakistan`);
  url.searchParams.set("filter", "countrycode:pk");
  url.searchParams.set("bias", "countrycode:pk");
  url.searchParams.set("lang", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "8");
  url.searchParams.set("apiKey", apiKey);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok)
      return NextResponse.json(
        { error: { message: "Location search is temporarily unavailable." } },
        { status: 503 },
      );
    const body = (await response.json()) as GeoapifyResponse;
    const results = (body.results ?? []).map((result) => ({
      label: result.formatted,
      primaryLabel: result.address_line1 ?? result.formatted,
      secondaryLabel: result.address_line2 ?? "Pakistan",
      lat: result.lat,
      lng: result.lon,
      type: result.result_type ?? "place",
      confidence: result.rank?.confidence ?? null,
      provider: "geoapify",
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: { message: "Location search is temporarily unavailable." } },
      { status: 503 },
    );
  }
}

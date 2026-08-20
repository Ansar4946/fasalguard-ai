import { NextResponse } from "next/server";

interface GeoapifyResult {
  formatted?: string;
  state?: string;
  county?: string;
  city?: string;
  suburb?: string;
}

interface GeoapifyResponse {
  results?: GeoapifyResult[];
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon))
    return NextResponse.json({ error: { message: "lat and lon are required." } }, { status: 400 });

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: { message: "Location lookup is not configured." } },
      { status: 503 },
    );

  const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", apiKey);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok)
      return NextResponse.json(
        { error: { message: "Location lookup is temporarily unavailable." } },
        { status: 503 },
      );
    const body = (await response.json()) as GeoapifyResponse;
    const result = body.results?.[0];
    // Real values only — a field Geoapify doesn't have comes back null, never guessed.
    return NextResponse.json({
      province: result?.state ?? null,
      district: result?.county ?? result?.city ?? null,
      tehsil: result?.suburb ?? result?.city ?? null,
      formatted: result?.formatted ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: { message: "Location lookup is temporarily unavailable." } },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";

interface GeoapifyResult {
  lat: number;
  lon: number;
  formatted: string;
}

interface GeoapifyResponse {
  results?: GeoapifyResult[];
}

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: { message: "Location search is not configured." } },
      { status: 503 },
    );

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", query);
  url.searchParams.set("filter", "countrycode:pk");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
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
      lat: result.lat,
      lng: result.lon,
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: { message: "Location search is temporarily unavailable." } },
      { status: 503 },
    );
  }
}

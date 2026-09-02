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

interface GoogleAddressComponent {
  long_name: string;
  types: string[];
}

interface GoogleReverseResponse {
  status: string;
  results?: Array<{
    formatted_address: string;
    address_components: GoogleAddressComponent[];
  }>;
}

function googleComponent(components: GoogleAddressComponent[], type: string): string | null {
  return components.find((component) => component.types.includes(type))?.long_name ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon))
    return NextResponse.json({ error: { message: "lat and lon are required." } }, { status: 400 });

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!googleApiKey && !apiKey)
    return NextResponse.json(
      { error: { message: "Location lookup is not configured." } },
      { status: 503 },
    );

  if (googleApiKey) {
    try {
      const googleUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      googleUrl.searchParams.set("latlng", `${lat},${lon}`);
      googleUrl.searchParams.set("language", "en");
      googleUrl.searchParams.set("key", googleApiKey);
      const googleResponse = await fetch(googleUrl, { signal: AbortSignal.timeout(8_000) });
      if (googleResponse.ok) {
        const googleBody = (await googleResponse.json()) as GoogleReverseResponse;
        const result = googleBody.status === "OK" ? googleBody.results?.[0] : undefined;
        if (result) {
          const components = result.address_components;
          return NextResponse.json({
            province: googleComponent(components, "administrative_area_level_1"),
            district:
              googleComponent(components, "administrative_area_level_2") ??
              googleComponent(components, "locality"),
            tehsil:
              googleComponent(components, "administrative_area_level_3") ??
              googleComponent(components, "sublocality"),
            formatted: result.formatted_address,
          });
        }
      }
    } catch {
      // Fall through to Geoapify.
    }
  }

  if (!apiKey)
    return NextResponse.json(
      { error: { message: "Location lookup is temporarily unavailable." } },
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

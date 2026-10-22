import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return NextResponse.json({ error: { code: "INVALID_FIELD", message: "Invalid field identifier." } }, { status: 400 });
  const platform = process.env.WEATHER_PLATFORM_ENABLED === "true";
  if (platform && !process.env.PLATFORM_API_URL)
    return NextResponse.json({ error: { code: "WEATHER_NOT_CONFIGURED", message: "Weather service unavailable." } }, { status: 503 });
  try {
    const { response, body } = await authenticatedJson(`/fields/${id}/weather/risks`, {}, platform ? "platform" : "core");
    if (!response.ok) {
      const { error, status } = apiError(body, response.status);
      return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "WEATHER_UNAVAILABLE", message: "Weather service unavailable. Retry shortly." } }, { status: 503 });
  }
}

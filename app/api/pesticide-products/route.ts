import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

export async function GET(request: Request): Promise<Response> {
  const search = (new URL(request.url).searchParams.get("search") ?? "").trim().slice(0, 80);
  try {
    const { response, body } = await authenticatedJson(`/pesticide-products?search=${encodeURIComponent(search)}`);
    if (!response.ok) {
      const { error, status } = apiError(body, response.status);
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: { message: "Dawai Check is temporarily unavailable." } }, { status: 503 });
  }
}

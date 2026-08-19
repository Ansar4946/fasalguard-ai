import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

type RouteContext = { params: Promise<{ farmId: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { farmId } = await params;
  const { response, body } = await authenticatedJson(`/farms/${farmId}/digital-twin`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

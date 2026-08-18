import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ farmId: string }> },
): Promise<Response> {
  const { farmId } = await params;
  const { response, body } = await authenticatedJson(`/farms/${farmId}/geojson`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

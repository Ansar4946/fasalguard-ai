import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { response, body } = await authenticatedJson(`/fields/${id}/summary`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

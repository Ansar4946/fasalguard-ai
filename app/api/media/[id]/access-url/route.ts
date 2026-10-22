import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

type RouteContext = { params: Promise<{ id: string }> };

/** Short-lived signed URL for one of the caller's own private media assets. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: { message: "Unknown media." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/media/${id}/access-url`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

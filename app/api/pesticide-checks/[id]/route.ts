import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { id } = await params;
  if (!z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).safeParse(id).success)
    return NextResponse.json({ error: { message: "Pesticide check not found." } }, { status: 404 });
  try {
    const { response, body } = await authenticatedJson(`/pesticide-checks/${id}`);
    if (!response.ok) {
      const { error, status } = apiError(body, response.status);
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: { message: "Dawai Check is temporarily unavailable." } }, { status: 503 });
  }
}

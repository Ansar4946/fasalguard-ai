import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

type RouteContext = { params: Promise<{ id: string }> };

async function scanId(params: RouteContext["params"]): Promise<string | null> {
  const { id } = await params;
  return z.string().uuid().safeParse(id).success ? id : null;
}

/** Latest stored severity assessment for an owned scan (404 when none has been calculated). */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const id = await scanId(params);
  if (!id) return NextResponse.json({ error: { message: "Unknown crop scan." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/crop-scans/${id}/severity`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

/** Calculates a new deterministic severity assessment from the scan's recorded evidence. */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const id = await scanId(params);
  if (!id) return NextResponse.json({ error: { message: "Unknown crop scan." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/crop-scans/${id}/severity`, { method: "POST" });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { status: 201 });
}

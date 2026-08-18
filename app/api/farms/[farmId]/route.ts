import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";
import { polygonSchema } from "@/lib/geo/polygon-schema";

const updateFarmSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  boundary: polygonSchema.optional(),
  province: z.string().trim().min(1).max(120).optional(),
  district: z.string().trim().min(1).max(120).optional(),
  tehsil: z.string().trim().min(1).max(120).optional(),
  soilType: z.string().trim().min(1).max(120).optional(),
  irrigationType: z.string().trim().min(1).max(120).optional(),
  waterSource: z.string().trim().min(1).max(120).optional(),
});

type RouteContext = { params: Promise<{ farmId: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { farmId } = await params;
  const { response, body } = await authenticatedJson(`/farms/${farmId}`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { farmId } = await params;
  const parsed = updateFarmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter valid farm details." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/farms/${farmId}`, {
    method: "PATCH",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { farmId } = await params;
  const { response, body } = await authenticatedJson(`/farms/${farmId}`, { method: "DELETE" });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return new Response(null, { status: 204 });
}

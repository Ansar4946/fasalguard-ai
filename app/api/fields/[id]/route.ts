import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";
import { polygonSchema } from "@/lib/geo/polygon-schema";

const cropCycleSchema = z.object({
  cropId: z.string().uuid(),
  varietyId: z.string().uuid().optional(),
  sowingDate: z.string().optional(),
  expectedHarvestDate: z.string().optional(),
  growthStage: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["planned", "active", "harvested", "cancelled"]),
});

const updateFieldSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  boundary: polygonSchema.optional(),
  currentCropCycle: cropCycleSchema.optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { id } = await params;
  const { response, body } = await authenticatedJson(`/fields/${id}`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { id } = await params;
  const parsed = updateFieldSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter valid field details." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/fields/${id}`, {
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
  const { id } = await params;
  const { response, body } = await authenticatedJson(`/fields/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return new Response(null, { status: 204 });
}

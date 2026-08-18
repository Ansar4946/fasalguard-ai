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

const createFieldSchema = z.object({
  name: z.string().trim().min(2).max(160),
  boundary: polygonSchema,
  currentCropCycle: cropCycleSchema.optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ farmId: string }> },
): Promise<Response> {
  const { farmId } = await params;
  const { response, body } = await authenticatedJson(`/farms/${farmId}/fields`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ farmId: string }> },
): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { farmId } = await params;
  const parsed = createFieldSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter valid field details." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/farms/${farmId}/fields`, {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { status: 201 });
}

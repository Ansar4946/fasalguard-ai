import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";
import { polygonSchema } from "@/lib/geo/polygon-schema";

const createFarmSchema = z.object({
  name: z.string().trim().min(2).max(160),
  boundary: polygonSchema,
  province: z.string().trim().min(1).max(120).optional(),
  district: z.string().trim().min(1).max(120).optional(),
  tehsil: z.string().trim().min(1).max(120).optional(),
  soilType: z.string().trim().min(1).max(120).optional(),
  irrigationType: z.string().trim().min(1).max(120).optional(),
  waterSource: z.string().trim().min(1).max(120).optional(),
});

export async function GET(): Promise<Response> {
  const { response, body } = await authenticatedJson("/farms");
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = createFarmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter valid farm details." } }, { status: 400 });
  const { response, body } = await authenticatedJson("/farms", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { status: 201 });
}

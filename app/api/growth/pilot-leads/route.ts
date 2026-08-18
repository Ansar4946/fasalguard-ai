import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, backendJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  country: z.string().trim().min(2).max(80),
  farmSizeAcres: z.coerce.number().min(0).optional(),
  mainCrop: z.string().trim().min(1).max(80),
  farmCount: z.coerce.number().int().min(0).optional(),
  acquisitionSource: z
    .enum(["DIRECT", "REFERRAL", "FARMER_GROUP", "SOCIAL", "PARTNER", "OTHER"])
    .optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Complete the required pilot details." } }, { status: 400 });
  const { response, body } = await backendJson("/growth/pilot-leads", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { status: response.status });
}

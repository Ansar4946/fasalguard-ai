import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const manualCheckSchema = z.object({
  brandName: z.string().trim().min(1).max(160),
  activeIngredient: z.string().trim().min(1).max(160).optional(),
  registrationNo: z.string().trim().min(1).max(80).optional(),
  expiryDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priceRs: z.number().min(0).max(10_000_000).optional(),
  language: z.enum(["en", "ur"]).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = manualCheckSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter a valid pesticide name." } }, { status: 400 });
  try {
    const { response, body } = await authenticatedJson("/pesticide-checks/manual", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    if (!response.ok) {
      const { error, status } = apiError(body, response.status);
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(body, { status: 201, headers: { "cache-control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: { message: "Dawai Check is temporarily unavailable." } }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const checkoutSchema = z.object({
  planCode: z.enum([
    "FARMER_PRO",
    "FARMER_PRO_ANNUAL",
    "FARM_BUSINESS",
    "FARM_BUSINESS_ANNUAL",
  ]),
});

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Choose a valid plan." } }, { status: 400 });
  const { response, body } = await authenticatedJson("/billing/stripe/checkout-session", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

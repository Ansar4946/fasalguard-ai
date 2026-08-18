import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const schema = z.object({
  planCode: z.enum(["FREE", "FARMER_PRO", "FARM_BUSINESS", "COOPERATIVE"]),
  provider: z.enum(["MANUAL_BANK_TRANSFER", "MANUAL_JAZZCASH", "MANUAL_EASYPAISA"]),
  providerPaymentReference: z.string().trim().min(4).max(255),
  notes: z.string().trim().min(1).max(2000).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter valid upgrade request details." } }, { status: 400 });
  const { response, body } = await authenticatedJson("/billing/upgrade-request", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { status: response.status });
}

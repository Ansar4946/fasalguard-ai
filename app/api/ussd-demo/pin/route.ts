import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const schema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    pin: z.string().regex(/^\d{4,6}$/),
    confirmPin: z.string().regex(/^\d{4,6}$/),
  })
  .refine((value) => value.pin === value.confirmPin, { message: "PINs do not match." });

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? "Enter valid PIN details." } }, { status: 400 });
  const { currentPassword, pin } = parsed.data;
  const { response, body } = await authenticatedJson<{ configured: boolean }>("/ussd/pin/setup", {
    method: "POST",
    body: JSON.stringify({ currentPassword, pin }),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}


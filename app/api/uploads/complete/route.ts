import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const completeSchema = z.object({
  mediaId: z.string().uuid(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = completeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter a valid upload completion request." } }, { status: 400 });
  const { response, body } = await authenticatedJson("/uploads/complete", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

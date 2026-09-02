import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const presignSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().min(1).max(104_857_600),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  purpose: z.enum(["crop-scan", "field-inspection", "expert-review", "voice-note", "satellite", "report"]),
});

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = presignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter a valid upload request." } }, { status: 400 });
  const { response, body } = await authenticatedJson("/uploads/presign", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const observationsSchema = z.object({
  observations: z
    .array(
      z.object({
        key: z.enum(["SPREADING", "FIELD_PERCENT", "INSECTS_VISIBLE", "SYMPTOM_ONSET"]),
        answer: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(8),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: { message: "Unknown crop scan." } }, { status: 400 });
  const parsed = observationsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Answer the observation questions." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/crop-scans/${id}/observations`, {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { status: 201 });
}

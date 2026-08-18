import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const verifySchema = z.object({ notes: z.string().trim().min(1).max(2000).optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { id } = await params;
  const parsed = verifySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter valid verification details." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/admin/billing/payments/${id}/verify`, {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { status: response.status });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const publishSchema = z.object({
  publicReferenceUrl: z.string().url().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { id } = await params;
  const parsed = publishSchema.safeParse((await request.json().catch(() => ({}))) || {});
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Invalid public reference URL." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/admin/feedback/${id}/publish`, {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

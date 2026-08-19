import { NextResponse } from "next/server";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { id } = await params;
  const { response, body } = await authenticatedJson(`/admin/feedback/${id}/unpublish`, {
    method: "POST",
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const idSchema = z.string().uuid();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Unknown task." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/tasks/${parsed.data}/complete`, { method: "POST" });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

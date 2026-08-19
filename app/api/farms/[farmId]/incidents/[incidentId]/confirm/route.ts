import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const confirmSchema = z.object({ confirmed: z.boolean() });

type RouteContext = { params: Promise<{ farmId: string; incidentId: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { farmId, incidentId } = await params;
  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Send a confirmed true/false value." } }, { status: 400 });
  const { response, body } = await authenticatedJson(
    `/farms/${farmId}/incidents/${incidentId}/confirm`,
    { method: "POST", body: JSON.stringify(parsed.data) },
  );
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

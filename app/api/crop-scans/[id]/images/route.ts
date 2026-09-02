import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const addImageSchema = z.object({
  mediaId: z.string().uuid(),
  category: z.enum(["LEAF_FRONT", "LEAF_BACK", "WHOLE_PLANT", "FIELD_CONTEXT", "PEST_IMAGE"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { id } = await params;
  const parsed = addImageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter a valid scan image." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/crop-scans/${id}/images`, {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

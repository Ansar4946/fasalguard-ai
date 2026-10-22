import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiError,
  authenticatedJson,
  mutationOriginAllowed,
} from "@/lib/auth/server-session";

const createSchema = z.object({
  farmId: z.uuid().optional(),
  fieldId: z.uuid().optional(),
  title: z.string().trim().min(2).max(160).optional(),
});
const noStore = { "cache-control": "no-store, private" };

export async function GET(): Promise<Response> {
  const { response, body } = await authenticatedJson("/assistant/conversations");
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: noStore });
}

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json(
      { error: { message: "Cross-origin request rejected." } },
      { status: 403 },
    );
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: { message: "Choose a valid farm and field." } },
      { status: 400 },
    );
  const { response, body } = await authenticatedJson("/assistant/conversations", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { status: 201, headers: noStore });
}

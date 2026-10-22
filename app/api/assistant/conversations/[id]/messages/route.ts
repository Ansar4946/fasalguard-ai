import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiError,
  authenticatedJson,
  mutationOriginAllowed,
} from "@/lib/auth/server-session";

const schema = z.object({
  message: z.string().trim().min(1).max(4000),
  language: z.enum(["en", "ur", "hi"]),
  idempotencyKey: z.uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json(
      { error: { message: "Cross-origin request rejected." } },
      { status: 403 },
    );
  const id = z.uuid().safeParse((await context.params).id);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success)
    return NextResponse.json(
      { error: { message: "Write a question of up to 4,000 characters." } },
      { status: 400 },
    );
  const { response, body } = await authenticatedJson(
    `/assistant/conversations/${id.data}/messages`,
    { method: "POST", body: JSON.stringify(parsed.data) },
  );
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, {
    status: 201,
    headers: { "cache-control": "no-store, private" },
  });
}

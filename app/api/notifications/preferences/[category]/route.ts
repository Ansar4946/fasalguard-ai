import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z
  .object({
    pushEnabled: z.boolean(),
    quietHoursStart: time.optional(),
    quietHoursEnd: time.optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
const categories = z.enum(["SATELLITE", "WEATHER", "DIAGNOSIS", "EXPERT", "OUTBREAK", "TASK", "SYSTEM"]);

export async function PUT(request: Request, context: { params: Promise<{ category: string }> }): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const category = categories.safeParse((await context.params).category);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!category.success || !parsed.success)
    return NextResponse.json({ error: { message: "Enter a valid notification setting." } }, { status: 400 });
  const { response, body } = await authenticatedJson(`/notifications/preferences/${category.data}`, {
    method: "PUT",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

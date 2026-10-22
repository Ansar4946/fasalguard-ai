import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiError,
  authenticatedJson,
  mutationOriginAllowed,
} from "@/lib/auth/server-session";

const schema = z.object({
  granted: z.boolean(),
  consentVersion: z.string().trim().min(1).max(64),
});

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json(
      { error: { message: "Cross-origin request rejected." } },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: { message: "Enter a valid voice consent request." } },
      { status: 400 },
    );
  const { response, body } = await authenticatedJson(
    "/assistant/speech/consent",
    { method: "POST", body: JSON.stringify(parsed.data) },
  );
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, {
    headers: { "cache-control": "no-store, private" },
  });
}

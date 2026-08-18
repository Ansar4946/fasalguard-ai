import { NextResponse } from "next/server";
import { z } from "zod";
import {
  backendJson,
  mutationOriginAllowed,
  safeBackendError,
} from "@/lib/auth/server-session";

const schema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128),
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
      { error: { message: "Use at least 12 characters for your password." } },
      { status: 400 },
    );
  const { response, body } = await backendJson("/auth/password/setup", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok)
    return NextResponse.json(safeBackendError(body, response.status), { status: response.status });
  return NextResponse.json({ ok: true });
}

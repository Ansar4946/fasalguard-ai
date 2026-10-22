import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

/** Reference crop catalogue (id, slug, name, varieties) for crop-cycle pickers. */
export async function GET(): Promise<Response> {
  const { response, body } = await authenticatedJson("/crops");
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "private, max-age=300" } });
}

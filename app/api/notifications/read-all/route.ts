import { NextResponse } from "next/server";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const { response, body } = await authenticatedJson("/notifications/read-all", { method: "POST", body: "{}" });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

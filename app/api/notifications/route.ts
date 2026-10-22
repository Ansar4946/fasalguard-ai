import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  const unreadOnly = incoming.get("unreadOnly");
  const limit = incoming.get("limit");
  if (unreadOnly !== null) {
    if (unreadOnly !== "true" && unreadOnly !== "false")
      return NextResponse.json({ error: { message: "unreadOnly must be true or false." } }, { status: 400 });
    query.set("unreadOnly", unreadOnly);
  }
  if (limit !== null) {
    if (!/^\d{1,3}$/.test(limit))
      return NextResponse.json({ error: { message: "limit must be a whole number between 1 and 100." } }, { status: 400 });
    query.set("limit", limit);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  const { response, body } = await authenticatedJson(`/notifications${suffix}`);
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

const noStore = { "cache-control": "no-store, private" };

/** Owner-scoped unread warning digest for the assistant page. Read-only. */
export async function GET(): Promise<Response> {
  const { response, body } = await authenticatedJson("/assistant/briefing");
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status, headers: noStore });
  }
  return NextResponse.json(body, { headers: noStore });
}

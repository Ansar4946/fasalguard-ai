import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

export async function GET(request: Request): Promise<Response> {
  const status = new URL(request.url).searchParams.get("status");
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const { response, body } = await authenticatedJson(`/admin/billing/payments${query}`);
  if (!response.ok) {
    const { error, status: code } = apiError(body, response.status);
    return NextResponse.json({ error }, { status: code });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

import { NextResponse } from "next/server";
import { apiError, backendJson } from "@/lib/auth/server-session";

export async function GET(): Promise<Response> {
  const { response, body } = await backendJson("/billing/plans");
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

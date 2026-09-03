import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.toString();
  const { response, body } = await authenticatedJson(
    `/market/prices${query ? `?${query}` : ""}`,
  );
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, {
    headers: { "cache-control": "private, no-store" },
  });
}

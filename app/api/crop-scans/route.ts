import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

export async function GET(request: Request): Promise<Response> {
  const fieldId = new URL(request.url).searchParams.get("fieldId");
  if (!fieldId)
    return NextResponse.json({ error: { message: "fieldId is required." } }, { status: 400 });
  const { response, body } = await authenticatedJson(
    `/crop-scans?fieldId=${encodeURIComponent(fieldId)}`,
  );
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

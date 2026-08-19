import { NextResponse } from "next/server";
import { readTokens, refreshSession } from "@/lib/auth/server-session";

const apiBase = () =>
  (process.env.FASALGUARD_API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

export async function GET(): Promise<Response> {
  const { access, refresh } = await readTokens();
  if (!access)
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } }, { status: 401 });
  let response = await fetch(`${apiBase()}/admin/ai-operations/export.csv`, {
    headers: { authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  if (response.status === 401 && refresh) {
    const renewed = await refreshSession(refresh);
    if (renewed)
      response = await fetch(`${apiBase()}/admin/ai-operations/export.csv`, {
        headers: { authorization: `Bearer ${renewed.accessToken}` },
        cache: "no-store",
      });
  }
  if (!response.ok)
    return NextResponse.json(
      { error: { code: "REQUEST_FAILED", message: "Could not export AI run evidence." } },
      { status: response.status },
    );
  const csv = await response.text();
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="ai-runs-evidence.csv"',
      "cache-control": "no-store, private",
    },
  });
}

import { NextResponse } from "next/server";
import { apiError, authenticatedJson, mutationOriginAllowed, readTokens } from "@/lib/auth/server-session";

type Context = { params: Promise<{ path: string[] }> };
const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const fieldPath = new RegExp(`^fields/${uuid}/(irrigation/(context|profile|events)|irrigation-runs|water-productivity-runs)$`);
const runPath = new RegExp(`^(irrigation-runs|water-productivity-runs)/${uuid}(/artifact)?$`);

async function handle(request: Request, context: Context) {
  const segments = (await context.params).path;
  const path = segments.join("/");
  if (!fieldPath.test(path) && !runPath.test(path)) return NextResponse.json({ error: { message: "Irrigation endpoint not found." } }, { status: 404 });
  const method = request.method;
  if (method !== "GET" && !mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  if ((method === "PUT" && !path.endsWith("/profile")) || (method === "POST" && !/\/(events|irrigation-runs|water-productivity-runs)$/.test(path)))
    return NextResponse.json({ error: { message: "Method not allowed." } }, { status: 405 });
  if (!process.env.PLATFORM_API_URL) return NextResponse.json({ error: { message: "Irrigation service is not configured." } }, { status: 503 });
  try {
    if (path.endsWith("/artifact")) {
      if (method !== "GET") return NextResponse.json({}, { status: 405 });
      const { access } = await readTokens();
      if (!access) return NextResponse.json({ error: { message: "Sign in required." } }, { status: 401 });
      const response = await fetch(`${process.env.PLATFORM_API_URL.replace(/\/$/, "")}/${path}`, {
        headers: { authorization: `Bearer ${access}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return NextResponse.json({ error: { message: "Artifact unavailable." } }, { status: response.status });
      if (response.headers.get("content-type") !== "application/x-netcdf" || Number(response.headers.get("content-length") ?? 0) > 128000000)
        return NextResponse.json({ error: { message: "Artifact exceeds supported download limits." } }, { status: 503 });
      return new Response(response.body, { headers: { "content-type": "application/x-netcdf", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
    let body: string | undefined;
    if (method !== "GET") {
      const raw = await request.text();
      if (raw.length > 262144) return NextResponse.json({ error: { message: "Input exceeds the supported size." } }, { status: 413 });
      try { body = JSON.stringify(JSON.parse(raw)); } catch { return NextResponse.json({ error: { message: "Invalid request body." } }, { status: 400 }); }
    }
    const query = new URL(request.url).searchParams;
    const cycle = query.get("cropCycleId");
    const suffix = cycle ? `?cropCycleId=${encodeURIComponent(cycle)}` : "";
    const result = await authenticatedJson(`/${path}${suffix}`, { method, body }, "platform");
    if (!result.response.ok) {
      const { error, status } = apiError(result.body, result.response.status);
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(result.body, { status: result.response.status, headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: { message: "Irrigation service is temporarily unavailable. Retry shortly." } }, { status: 503 });
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;

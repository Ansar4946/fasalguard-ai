import { NextResponse } from "next/server";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const id = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context): Promise<Response> {
  const path = (await context.params).path.join("/");
  const expected = path === "validate" ? "POST" : new RegExp(`^farms/${id}/fields/import$`).test(path) ? "POST"
    : new RegExp(`^farms/${id}/fields/geojson$`).test(path) ? "GET" : new RegExp(`^fields/${id}/boundary$`).test(path) ? "PATCH" : null;
  if (!expected) return NextResponse.json({ error: { message: "Geometry endpoint not found." } }, { status: 404 });
  if (request.method !== expected) return NextResponse.json({ error: { message: "Method not allowed." } }, { status: 405 });
  if (request.method !== "GET" && !mutationOriginAllowed(request)) return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  if (!process.env.PLATFORM_API_URL) return NextResponse.json({ error: { message: "Boundary service is not configured." } }, { status: 503 });
  try {
    let body: string | undefined;
    if (request.method !== "GET") {
      const reader = request.body?.getReader();
      if (!reader) return NextResponse.json({ error: { message: "JSON body required." } }, { status: 400 });
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 262144) { await reader.cancel(); return NextResponse.json({ error: { message: "Geometry request exceeds 256 KiB." } }, { status: 413 }); }
        chunks.push(value);
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      try { body = JSON.stringify(JSON.parse(new TextDecoder().decode(buffer))); }
      catch { return NextResponse.json({ error: { message: "Invalid JSON." } }, { status: 400 }); }
    }
    const upstream = path === "validate" ? "/geometry/validate" : `/${path}`;
    const result = await authenticatedJson(upstream, { method: request.method, body }, "platform");
    if (!result.response.ok) {
      const { error, status } = apiError(result.body, result.response.status);
      return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(result.body, { status: result.response.status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: { message: "Boundary service unavailable. Unsaved changes are retained; retry shortly." } }, { status: 503 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;

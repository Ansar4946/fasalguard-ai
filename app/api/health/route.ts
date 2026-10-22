import { NextResponse } from "next/server";

/** Process liveness only. Backend readiness is checked separately by the release smoke test. */
export async function GET(): Promise<Response> {
  return NextResponse.json({ status: "ok", service: "web" }, { headers: { "Cache-Control": "no-store" } });
}

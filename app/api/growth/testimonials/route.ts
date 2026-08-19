import { NextResponse } from "next/server";
import { backendJson } from "@/lib/auth/server-session";

export async function GET(): Promise<Response> {
  const { response, body } = await backendJson("/growth/testimonials");
  if (!response.ok) return NextResponse.json({ error: { message: "Unavailable." } }, { status: 502 });
  return NextResponse.json(body, { headers: { "cache-control": "public, max-age=60" } });
}

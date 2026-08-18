import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const SEEN_COOKIE = "fg_seen_today";

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const store = await cookies();
  if (store.get(SEEN_COOKIE)?.value === "1") return new NextResponse(null, { status: 204 });
  await backendJson("/growth/landing-view", { method: "POST", body: "{}" }).catch(() => null);
  store.set(SEEN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return new NextResponse(null, { status: 204 });
}

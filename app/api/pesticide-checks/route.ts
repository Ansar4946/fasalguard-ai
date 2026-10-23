import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const createCheckSchema = z.object({
  mediaAssetId: z.string().uuid(),
  language: z.enum(["en", "ur"]).optional(),
  priceRs: z.number().min(0).max(10_000_000).optional(),
  packSize: z.string().trim().min(1).max(60).optional(),
});

const unavailable = () =>
  NextResponse.json({ error: { message: "Dawai Check is temporarily unavailable." } }, { status: 503 });

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = createCheckSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter a valid pesticide check request." } }, { status: 400 });
  try {
    const { response, body } = await authenticatedJson("/pesticide-checks", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    if (!response.ok) {
      const { error, status } = apiError(body, response.status);
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(body, { status: 201, headers: { "cache-control": "no-store, private" } });
  } catch {
    return unavailable();
  }
}

export async function GET(): Promise<Response> {
  try {
    const { response, body } = await authenticatedJson("/pesticide-checks");
    if (!response.ok) {
      const { error, status } = apiError(body, response.status);
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
  } catch {
    return unavailable();
  }
}

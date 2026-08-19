import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson, mutationOriginAllowed } from "@/lib/auth/server-session";

const submitEventFeedbackSchema = z.object({
  feature: z.enum(["ROADMAP_COMPLETION", "INCIDENT_RESOLUTION", "WEEKLY_REPORT", "CROP_DIAGNOSIS"]),
  contextId: z.string().uuid().optional(),
  farmId: z.string().uuid().optional(),
  useful: z.boolean(),
  wouldRecommend: z.boolean().optional(),
  whatHelped: z.string().trim().min(1).max(2000).optional(),
  whatImprove: z.string().trim().min(1).max(2000).optional(),
  permissionToQuote: z.boolean().optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json({ error: { message: "Cross-origin request rejected." } }, { status: 403 });
  const parsed = submitEventFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Enter valid feedback." } }, { status: 400 });
  const { response, body } = await authenticatedJson("/growth/feedback/events", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body);
}

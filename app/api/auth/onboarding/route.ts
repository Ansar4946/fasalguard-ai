import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  backendJson,
  mutationOriginAllowed,
  safeBackendError,
  setSessionCookies,
} from "@/lib/auth/server-session";
import type { CurrentUser } from "@/features/auth/types";

const schema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  preferredLanguage: z.string().trim().min(2).max(16),
  anonymousContribution: z.boolean(),
  nearbyAlerts: z.boolean(),
  weatherAlerts: z.boolean(),
  taskReminders: z.boolean(),
  referralCode: z.string().trim().length(8).optional().or(z.literal("").transform(() => undefined)),
  acquisitionSource: z
    .enum(["DIRECT", "REFERRAL", "FARMER_GROUP", "SOCIAL", "PARTNER", "OTHER"])
    .optional(),
});

type Registration = {
  user: CurrentUser;
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
  emailDelivery: "sent" | "failed";
};

const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";

function generateTemporaryPassword(): string {
  const bytes = randomBytes(14);
  let password = "";
  for (const byte of bytes) password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
  return password;
}

export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request))
    return NextResponse.json(
      { error: { message: "Cross-origin request rejected." } },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: { message: "Complete the required onboarding information." } },
      { status: 400 },
    );
  const input = parsed.data;
  const consents = [
    {
      type: "ANONYMOUS_COMMUNITY_REPORTING",
      policyVersion: "2026-08",
      granted: input.anonymousContribution,
    },
    {
      type: "NOTIFICATIONS",
      policyVersion: "2026-08",
      granted: input.nearbyAlerts || input.weatherAlerts || input.taskReminders,
    },
  ];
  const { response, body } = await backendJson<Registration>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      phone: input.phone,
      fullName: input.fullName,
      preferredLanguage: input.preferredLanguage,
      password: generateTemporaryPassword(),
      referralCode: input.referralCode,
      acquisitionSource: input.acquisitionSource,
      consents,
      device: {
        deviceIdentifier: `web-onboarding-${randomUUID()}`,
        platform: "web",
      },
    }),
  });
  if (!response.ok || !body.tokens || !body.user)
    return NextResponse.json(safeBackendError(body, response.status), { status: response.status });
  await setSessionCookies(body.tokens);
  return NextResponse.json({ user: body.user, emailDelivery: body.emailDelivery }, { status: 201 });
}

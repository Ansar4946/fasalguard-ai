import type { ApiErrorBody, CurrentUser } from "./types";
export class AuthClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json", ...init?.headers },
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T;
    if (!response.ok)
      throw new AuthClientError(
        body.error?.message ??
          (response.status === 401
            ? "No account found for that email or phone number."
            : "Unable to complete the request."),
        response.status,
        body.error?.code ?? "REQUEST_FAILED",
      );
    return body;
  } catch (error) {
    if (error instanceof AuthClientError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw new AuthClientError(
        "The authentication service took too long to respond.",
        0,
        "TIMEOUT",
      );
    throw new AuthClientError(
      "Unable to reach the authentication service.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
export const authClient = {
  login: (identifier: string) =>
    request<{ user: CurrentUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),
  completeOnboarding: (input: {
    fullName: string;
    email: string;
    phone?: string;
    preferredLanguage: string;
    anonymousContribution: boolean;
    nearbyAlerts: boolean;
    weatherAlerts: boolean;
    taskReminders: boolean;
    referralCode?: string;
    acquisitionSource?: string;
  }) =>
    request<{ user: CurrentUser; emailDelivery: "sent" | "failed" }>(
      "/api/auth/onboarding",
      { method: "POST", body: JSON.stringify(input) },
    ),
  me: () => request<CurrentUser>("/api/auth/me"),
  logout: async () => {
    await request<{ ok: true }>("/api/auth/logout", {
      method: "POST",
      body: "{}",
    });
  },
};

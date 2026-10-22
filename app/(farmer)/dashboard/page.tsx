import { FarmerDashboard } from "@/components/dashboard/farmer-dashboard";
import { ReferralCard } from "@/components/dashboard/referral-card";
import { authenticatedJson } from "@/lib/auth/server-session";
import type { DashboardData } from "@/features/dashboard/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; email?: string; farmError?: string }>;
}) {
  const [params, { response, body }] = await Promise.all([
    searchParams,
    authenticatedJson<DashboardData>("/dashboard"),
  ]);
  return (
    <>
      {params.onboarding === "complete" && (
        <div
          role="status"
          className={`mx-auto mt-4 max-w-[1180px] rounded-2xl border px-4 py-3 text-xs font-semibold md:mt-6 ${params.email === "sent" ? "border-success/20 bg-green-50 text-brand-dark" : "border-amber-300 bg-amber-50 text-amber-900"}`}
        >
          {params.email === "sent"
            ? "Account created. Check your email to choose your permanent password."
            : "Account created and you are signed in. Password email could not be delivered; ask support to verify SMTP configuration before signing out."}
        </div>
      )}
      {params.onboarding === "complete" && params.farmError === "1" && (
        <div
          role="status"
          className="mx-auto mt-3 max-w-[1180px] rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900 md:mt-4"
        >
          Account created — we couldn&apos;t save your farm yet, add it from
          My Farms.
        </div>
      )}
      {response.ok && body.summary ? (
        <FarmerDashboard data={body} />
      ) : (
        <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-7">
          <p
            role="alert"
            className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-xs font-semibold text-danger"
          >
            Could not load your dashboard right now. Try refreshing the page.
          </p>
        </div>
      )}
      <ReferralCard />
    </>
  );
}

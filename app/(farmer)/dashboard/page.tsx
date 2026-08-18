import { FarmerDashboard } from "@/components/dashboard/farmer-dashboard";
import { ReferralCard } from "@/components/dashboard/referral-card";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; email?: string; farmError?: string }>;
}) {
  const params = await searchParams;
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
      <FarmerDashboard />
      <ReferralCard />
    </>
  );
}

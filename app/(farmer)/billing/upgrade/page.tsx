import { UpgradeRequestForm } from "@/components/billing/upgrade-request-form";

export default function UpgradePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold text-brand-dark">Upgrade your plan</h1>
      <p className="mt-1 text-xs leading-5 text-muted">
        More farms, more crop seasons, more Gemini analyses per month, satellite monitoring and
        advanced reports.
      </p>
      <div className="mt-4">
        <UpgradeRequestForm />
      </div>
    </div>
  );
}

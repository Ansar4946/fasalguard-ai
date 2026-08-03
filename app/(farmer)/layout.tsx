import { FarmerShell } from "@/components/layout/farmer-shell";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";

export default function FarmerLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingGate><FarmerShell>{children}</FarmerShell></OnboardingGate>;
}

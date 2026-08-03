import type { Metadata } from "next";
import { OnboardingComplete } from "@/components/onboarding/onboarding-complete";

export const metadata: Metadata = {
  title: "Setup complete | FasalGuard AI",
  description: "Your FasalGuard farm setup is complete.",
};

export default function OnboardingCompletePage() {
  return <OnboardingComplete />;
}

import type { Metadata } from "next";
import { PersonalInformation } from "@/components/onboarding/personal-information";

export const metadata: Metadata = {
  title: "Personal information | FasalGuard AI",
  description: "Set up your FasalGuard farmer profile and communication preferences.",
};

export default function PersonalInformationPage() {
  return <PersonalInformation />;
}

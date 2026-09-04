import type { Metadata } from "next";
import { OnboardingProvider } from "@/features/onboarding/onboarding-provider";
import { AuthProvider } from "@/features/auth/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FasalGuard AI", template: "%s | FasalGuard AI" },
  description: "AI-powered crop health monitoring and early outbreak warnings.",
  icons: {
    icon: "/fasalguard-mark.png",
    apple: "/fasalguard-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AuthProvider>
          <OnboardingProvider>{children}</OnboardingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

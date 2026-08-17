import type { Metadata } from "next";
import { Manrope, Noto_Sans_Arabic } from "next/font/google";
import { OnboardingProvider } from "@/features/onboarding/onboarding-provider";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700", "800"],
});

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  display: "swap",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "FasalGuard AI", template: "%s | FasalGuard AI" },
  description: "AI-powered crop health monitoring and early outbreak warnings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${manrope.variable} ${notoSansArabic.variable}`}><OnboardingProvider>{children}</OnboardingProvider></body>
    </html>
  );
}

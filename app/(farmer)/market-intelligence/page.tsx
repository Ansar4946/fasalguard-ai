import type { Metadata } from "next";
import { MarketIntelligenceDashboard } from "@/components/market-intelligence/market-intelligence-dashboard";

export const metadata: Metadata = { title: "Market Intelligence | FasalGuard AI", description: "Preview crop price trends and nearby mandi comparisons." };

export default function MarketIntelligencePage() { return <MarketIntelligenceDashboard />; }

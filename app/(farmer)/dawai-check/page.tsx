import { notFound } from "next/navigation";
import { DawaiCheckApp } from "@/components/dawai-check/dawai-check-app";
import { isDawaiCheckEnabled } from "@/features/dawai-check/flag";

export const metadata = { title: "Dawai Check | FasalGuard AI" };

export default function DawaiCheckPage() {
  if (!isDawaiCheckEnabled()) notFound();
  return <DawaiCheckApp />;
}

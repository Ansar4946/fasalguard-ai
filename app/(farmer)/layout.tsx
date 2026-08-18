import { FarmerShell } from "@/components/layout/farmer-shell";

export default function FarmerLayout({ children }: { children: React.ReactNode }) {
  return <FarmerShell>{children}</FarmerShell>;
}

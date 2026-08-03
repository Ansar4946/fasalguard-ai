import { ScanSessionProvider } from "@/features/diagnosis/scan-session-provider";
export default function ScanLayout({ children }: { children: React.ReactNode }) { return <ScanSessionProvider>{children}</ScanSessionProvider>; }

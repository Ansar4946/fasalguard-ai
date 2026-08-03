import type { Metadata } from "next";
import { SatelliteWorkspace } from "@/components/intelligence/satellite-workspace";
export const metadata: Metadata = { title: "Satellite Monitoring", description: "Field-level vegetation, moisture and change monitoring." };
export default function SatellitePage(){return <SatelliteWorkspace/>}

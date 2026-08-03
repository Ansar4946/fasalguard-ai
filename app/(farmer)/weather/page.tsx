import type { Metadata } from "next";
import { WeatherIntelligence } from "@/components/intelligence/weather-intelligence";
export const metadata: Metadata = { title: "Weather Intelligence", description: "Crop-aware weather guidance and agricultural risk alerts." };
export default function WeatherPage(){return <WeatherIntelligence/>}

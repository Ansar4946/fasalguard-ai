export type RiskLevel = "beneficial" | "caution" | "harmful" | "critical";

export interface SatelliteZone {
  id: string;
  name: string;
  status: "healthy" | "watch" | "high-stress";
  areaAcres: number;
  changePercent: number;
  left: number;
  top: number;
}

export interface CropWeatherDay {
  day: string;
  date: string;
  temperature: string;
  rain: number;
  humidity: number;
  windKph: number;
  suitability: number;
  risk: RiskLevel;
  action: string;
  spray: string;
}

export interface SmartAlert {
  id: string;
  category: "humidity" | "wind" | "irrigation" | "satellite";
  urgency: "medium" | "high" | "critical";
  title: string;
  field: string;
  crop: string;
  happening: string;
  why: string;
  action: string;
  href: string;
}

import type { Farm } from "./types";

export const farms: Farm[] = [
  {
    id: "green-valley",
    name: "Green Valley Farm",
    location: "Multan, Punjab",
    sizeAcres: 124,
    fieldCount: 3,
    activeCrops: 3,
    healthScore: 86,
    alerts: 2,
    weather: { temperatureC: 24, condition: "Partly sunny", humidity: 58, windKph: 12 },
    fields: [
      { id: "north-field", farmId: "green-valley", name: "North Field", crop: "Cotton", variety: "CIM-632", sizeAcres: 42, sowingDate: "2026-04-12", growthStage: "Flowering", healthScore: 82, healthStatus: "healthy", irrigation: "available", lastScan: "2026-07-30" },
      { id: "canal-field", farmId: "green-valley", name: "Canal Field", crop: "Wheat", variety: "Faisalabad-08", sizeAcres: 38, sowingDate: "2025-11-10", growthStage: "Vegetative", healthScore: 68, healthStatus: "attention", irrigation: "available", lastScan: "2026-07-27" },
      { id: "south-field", farmId: "green-valley", name: "South Field", crop: "Cotton", variety: "CIM-663", sizeAcres: 44, sowingDate: "2026-04-18", growthStage: "Flowering", healthScore: 43, healthStatus: "critical", irrigation: "limited", lastScan: "2026-07-31" },
    ],
  },
  { id: "east-orchard", name: "East Orchard Farm", location: "Khanewal, Punjab", sizeAcres: 76, fieldCount: 2, activeCrops: 2, healthScore: 91, alerts: 0, weather: { temperatureC: 25, condition: "Clear", humidity: 51, windKph: 9 }, fields: [] },
];

export function getFarm(id: string) { return farms.find((farm) => farm.id === id); }

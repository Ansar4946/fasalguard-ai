export type HealthStatus = "healthy" | "attention" | "critical";
export type IrrigationStatus = "available" | "limited" | "unavailable";

export interface Field {
  id: string;
  farmId: string;
  name: string;
  crop: string;
  variety: string;
  sizeAcres: number;
  sowingDate: string;
  growthStage: string;
  healthScore: number;
  healthStatus: HealthStatus;
  irrigation: IrrigationStatus;
  lastScan: string;
}

export interface Farm {
  id: string;
  name: string;
  location: string;
  sizeAcres: number;
  fieldCount: number;
  activeCrops: number;
  healthScore: number;
  alerts: number;
  weather: { temperatureC: number; condition: string; humidity: number; windKph: number };
  fields: Field[];
}

export interface CreateFieldInput {
  farmId: string;
  name: string;
  sizeAcres: number;
  crop: string;
  variety: string;
  sowingDate: string;
  irrigation: IrrigationStatus;
}

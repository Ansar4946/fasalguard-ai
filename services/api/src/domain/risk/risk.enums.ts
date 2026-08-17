export enum FieldRiskLevel {
  VeryLow = 'VERY_LOW',
  Low = 'LOW',
  Moderate = 'MODERATE',
  High = 'HIGH',
  Critical = 'CRITICAL',
}
export enum RiskTrigger {
  Api = 'API_REQUEST',
  Weather = 'WEATHER_UPDATE',
  Satellite = 'SATELLITE_UPDATE',
  Outbreak = 'OUTBREAK_UPDATE',
  FarmerScan = 'FARMER_SCAN',
}

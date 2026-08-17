export enum WeatherSuitability {
  Beneficial = 'BENEFICIAL',
  MostlyBeneficial = 'MOSTLY_BENEFICIAL',
  Caution = 'CAUTION',
  Harmful = 'HARMFUL',
  Critical = 'CRITICAL',
}
export enum WeatherRiskCategory {
  HeatStress = 'HEAT_STRESS',
  ColdStress = 'COLD_STRESS',
  HighHumidity = 'HIGH_HUMIDITY',
  HeavyRain = 'HEAVY_RAIN',
  Waterlogging = 'WATERLOGGING',
  WaterDeficit = 'WATER_DEFICIT',
  StrongWind = 'STRONG_WIND',
  SprayingUnsuitable = 'SPRAYING_UNSUITABLE',
  DiseaseFavourable = 'DISEASE_FAVOURABLE_CONDITIONS',
  PestFavourable = 'PEST_FAVOURABLE_CONDITIONS',
}
export enum RuleValidationStatus {
  DemoUnverified = 'DEMO_UNVERIFIED',
  PendingExpertReview = 'PENDING_EXPERT_REVIEW',
  ExpertApproved = 'EXPERT_APPROVED',
  Rejected = 'REJECTED',
}

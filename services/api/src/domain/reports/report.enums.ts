export enum ReportType {
  SatelliteHealth = 'SATELLITE_HEALTH',
  Diagnosis = 'DIAGNOSIS',
  ExpertReview = 'EXPERT_REVIEW',
  FieldHealth = 'FIELD_HEALTH',
  WeatherSuitability = 'WEATHER_SUITABILITY',
  WeeklyActionPlan = 'WEEKLY_ACTION_PLAN',
  OutbreakSummary = 'OUTBREAK_SUMMARY',
}
export enum ReportStatus {
  Queued = 'QUEUED',
  Generating = 'GENERATING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}
export enum AnalyticsEventType {
  AlertGenerated = 'ALERT_GENERATED',
  FarmerAlerted = 'FARMER_ALERTED',
}

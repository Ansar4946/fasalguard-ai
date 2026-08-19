export enum AIOperation {
  CropAnalysis = 'CROP_ANALYSIS',
  FarmHealthAnalysis = 'FARM_HEALTH_ANALYSIS',
  RoadmapGeneration = 'ROADMAP_GENERATION',
  IncidentInvestigation = 'INCIDENT_INVESTIGATION',
  FollowUpAnalysis = 'FOLLOW_UP_ANALYSIS',
  WeatherRiskAnalysis = 'WEATHER_RISK_ANALYSIS',
  SatelliteRiskAnalysis = 'SATELLITE_RISK_ANALYSIS',
  WeeklySummary = 'WEEKLY_SUMMARY',
}
export enum AIRunStatus {
  Queued = 'QUEUED',
  Running = 'RUNNING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}
export enum HumanReviewStatus {
  NotRequired = 'NOT_REQUIRED',
  Required = 'REQUIRED',
  Reviewed = 'REVIEWED',
}

export enum FarmBrainRunStatus {
  Queued = 'QUEUED',
  Running = 'RUNNING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

export enum FarmHealthStatus {
  Healthy = 'HEALTHY',
  Watch = 'WATCH',
  AtRisk = 'AT_RISK',
  Critical = 'CRITICAL',
  Unknown = 'UNKNOWN',
}

export enum FarmBrainToolName {
  GetFarmDigitalTwin = 'getFarmDigitalTwin',
  GetLatestWeather = 'getLatestWeather',
  GetVegetationTrend = 'getVegetationTrend',
  GetRecentFarmerImages = 'getRecentFarmerImages',
  CreateIncident = 'createIncident',
  CreateInspectionTask = 'createInspectionTask',
  ScheduleFollowUp = 'scheduleFollowUp',
  SendFarmerAlert = 'sendFarmerAlert',
  RequestFarmerPhoto = 'requestFarmerPhoto',
  EscalateToExpert = 'escalateToExpert',
}

export enum FarmBrainToolCallStatus {
  Proposed = 'PROPOSED',
  AwaitingConfirmation = 'AWAITING_CONFIRMATION',
  RejectedByPolicy = 'REJECTED_BY_POLICY',
  Confirmed = 'CONFIRMED',
  Executed = 'EXECUTED',
  Failed = 'FAILED',
}

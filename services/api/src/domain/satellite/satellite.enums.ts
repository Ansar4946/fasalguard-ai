export enum SatelliteProcessingStatus {
  Queued = 'QUEUED',
  SearchingScene = 'SEARCHING_SCENE',
  Processing = 'PROCESSING',
  Analysing = 'ANALYSING',
  Completed = 'COMPLETED',
  NoValidScene = 'NO_VALID_SCENE',
  CloudBlocked = 'CLOUD_BLOCKED',
  Failed = 'FAILED',
}
export enum SatelliteDataQuality {
  Good = 'GOOD',
  Partial = 'PARTIAL',
  Poor = 'POOR',
  Unknown = 'UNKNOWN',
}
export enum IntegrationOperation {
  OAuth = 'OAUTH',
  Catalog = 'CATALOG',
  Process = 'PROCESS',
  Statistical = 'STATISTICAL',
}

/** Satellite conclusions are deliberately limited to non-diagnostic observations. */
export enum SatelliteAnomalyLabel {
  VegetationDecline = 'VEGETATION_DECLINE',
  PossibleWaterStress = 'POSSIBLE_WATER_STRESS',
  PossibleExcessMoisture = 'POSSIBLE_EXCESS_MOISTURE',
  UnevenGrowth = 'UNEVEN_GROWTH',
  UnknownStress = 'UNKNOWN_STRESS',
}

export enum SatelliteBaselineMethod {
  RollingFieldBaseline = 'ROLLING_FIELD_BASELINE',
  PreviousValidObservation = 'PREVIOUS_VALID_OBSERVATION',
  InsufficientHistory = 'INSUFFICIENT_HISTORY',
}

export enum SatelliteAnomalyAssessmentStatus {
  Completed = 'COMPLETED',
  InsufficientHistory = 'INSUFFICIENT_HISTORY',
  QualityBlocked = 'QUALITY_BLOCKED',
}

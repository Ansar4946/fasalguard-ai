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

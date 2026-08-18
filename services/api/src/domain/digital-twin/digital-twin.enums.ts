export enum IncidentState {
  Detected = 'DETECTED',
  Investigating = 'INVESTIGATING',
  ActionRequired = 'ACTION_REQUIRED',
  Monitoring = 'MONITORING',
  Recovering = 'RECOVERING',
  Resolved = 'RESOLVED',
  Escalated = 'ESCALATED',
  Dismissed = 'DISMISSED',
}

export enum InterventionStatus {
  Planned = 'PLANNED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

export enum VerificationStatus {
  Pending = 'PENDING',
  Improved = 'IMPROVED',
  Unchanged = 'UNCHANGED',
  Worsened = 'WORSENED',
  Inconclusive = 'INCONCLUSIVE',
}

export enum EvidenceFreshness {
  Fresh = 'fresh',
  Stale = 'stale',
  Missing = 'missing',
  Estimated = 'estimated',
}

export enum AcquisitionSource {
  Direct = 'DIRECT',
  Referral = 'REFERRAL',
  FarmerGroup = 'FARMER_GROUP',
  Social = 'SOCIAL',
  Partner = 'PARTNER',
  Other = 'OTHER',
}
export enum PilotLeadStatus {
  New = 'NEW',
  Contacted = 'CONTACTED',
  Converted = 'CONVERTED',
  Declined = 'DECLINED',
}
export enum LifecycleEmailType {
  OnboardingIncomplete = 'ONBOARDING_INCOMPLETE',
  RoadmapReady = 'ROADMAP_READY',
  InsightReady = 'INSIGHT_READY',
  WeeklySummary = 'WEEKLY_SUMMARY',
}
export enum PilotEnrollmentStatus {
  Invited = 'INVITED',
  Registered = 'REGISTERED',
  Onboarded = 'ONBOARDED',
  Active = 'ACTIVE',
  Completed = 'COMPLETED',
  Dropped = 'DROPPED',
}
export enum FeedbackContextType {
  General = 'GENERAL',
  Onboarding = 'ONBOARDING',
  FarmBrainInvestigation = 'FARM_BRAIN_INVESTIGATION',
  CropScan = 'CROP_SCAN',
  PilotProgram = 'PILOT_PROGRAM',
  RoadmapCompletion = 'ROADMAP_COMPLETION',
  IncidentResolution = 'INCIDENT_RESOLUTION',
  WeeklyReport = 'WEEKLY_REPORT',
  CropDiagnosis = 'CROP_DIAGNOSIS',
}
/** The 4 "meaningful event" features real event-triggered feedback can be requested for. */
export const EVENT_FEEDBACK_FEATURES = [
  FeedbackContextType.RoadmapCompletion,
  FeedbackContextType.IncidentResolution,
  FeedbackContextType.WeeklyReport,
  FeedbackContextType.CropDiagnosis,
] as const;

export enum UserRole {
  Farmer = 'FARMER',
  AgricultureExpert = 'AGRICULTURE_EXPERT',
  FieldWorker = 'FIELD_WORKER',
  NgoViewer = 'NGO_VIEWER',
  GovernmentViewer = 'GOVERNMENT_VIEWER',
  Admin = 'ADMIN',
  SuperAdmin = 'SUPER_ADMIN',
}
export enum UserStatus {
  Pending = 'pending',
  Active = 'active',
  Suspended = 'suspended',
}
export enum ExpertVerificationStatus {
  Pending = 'pending',
  Verified = 'verified',
  Rejected = 'rejected',
}
export enum ConsentType {
  LocationProcessing = 'LOCATION_PROCESSING',
  AnonymousCommunityReporting = 'ANONYMOUS_COMMUNITY_REPORTING',
  AiImageAnalysis = 'AI_IMAGE_ANALYSIS',
  Notifications = 'NOTIFICATIONS',
  ResearchDataUse = 'RESEARCH_DATA_USE',
}
export enum DevicePlatform {
  Android = 'android',
  Ios = 'ios',
  Web = 'web',
}

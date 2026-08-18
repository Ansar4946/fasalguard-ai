export enum PlanCode {
  Free = 'FREE',
  FarmerPro = 'FARMER_PRO',
  FarmBusiness = 'FARM_BUSINESS',
  Cooperative = 'COOPERATIVE',
}
export enum SubscriptionStatus {
  Trial = 'TRIAL',
  Active = 'ACTIVE',
  PastDue = 'PAST_DUE',
  Cancelled = 'CANCELLED',
  Ended = 'ENDED',
}
export enum PaymentStatus {
  Pending = 'PENDING',
  Paid = 'PAID',
  Failed = 'FAILED',
  Refunded = 'REFUNDED',
  Cancelled = 'CANCELLED',
}
export enum PaymentProvider {
  ManualBankTransfer = 'MANUAL_BANK_TRANSFER',
  ManualJazzCash = 'MANUAL_JAZZCASH',
  ManualEasyPaisa = 'MANUAL_EASYPAISA',
}
export enum InvoiceStatus {
  Draft = 'DRAFT',
  Issued = 'ISSUED',
  Paid = 'PAID',
  Void = 'VOID',
}
export enum BillingEventType {
  SubscriptionCreated = 'SUBSCRIPTION_CREATED',
  UpgradeRequested = 'UPGRADE_REQUESTED',
  UpgradeCancelled = 'UPGRADE_CANCELLED',
  PaymentVerified = 'PAYMENT_VERIFIED',
  PaymentRejected = 'PAYMENT_REJECTED',
  PaymentRefunded = 'PAYMENT_REFUNDED',
  SubscriptionActivated = 'SUBSCRIPTION_ACTIVATED',
  SubscriptionDowngraded = 'SUBSCRIPTION_DOWNGRADED',
  OrganizationPlanAssigned = 'ORGANIZATION_PLAN_ASSIGNED',
}
export enum EntitlementMetric {
  Farms = 'maxFarms',
  ActiveCropSeasons = 'maxActiveCropSeasons',
  GeminiAnalysesPerMonth = 'geminiAnalysesPerMonth',
  SatelliteMonitoring = 'satelliteMonitoring',
  AdvancedReports = 'advancedReports',
  TeamMembers = 'maxTeamMembers',
}

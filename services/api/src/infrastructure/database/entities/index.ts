import { Consent } from '../../../domain/identity/consent.entity';
import { Device } from '../../../domain/identity/device.entity';
import { ExpertProfile } from '../../../domain/identity/expert-profile.entity';
import { FarmerProfile } from '../../../domain/identity/farmer-profile.entity';
import { User } from '../../../domain/identity/user.entity';
import { Crop } from '../../../domain/crops/crop.entity';
import { CropVariety } from '../../../domain/crops/crop-variety.entity';
import { CropCycle } from '../../../domain/farms/crop-cycle.entity';
import { Farm } from '../../../domain/farms/farm.entity';
import { Field } from '../../../domain/farms/field.entity';
import { AuthSession } from '../../../domain/identity/auth-session.entity';
import { MediaAsset } from '../../../domain/media/media-asset.entity';
import {
  FieldHealthScore,
  IntegrationUsage,
  SatelliteCapture,
  SatelliteAnomalyAssessment,
  SatelliteLayer,
  SatelliteStatistics,
  SatelliteStressZone,
} from '../../../domain/satellite/satellite.entities';
import {
  CropWeatherRule,
  WeatherForecast,
  WeatherRiskAlert,
  WeatherRiskAssessment,
  WeatherSnapshot,
} from '../../../domain/weather/weather.entities';
import {
  CropScan,
  Diagnosis,
  DiagnosisAlternative,
  ImageQualityResult,
  ModelPrediction,
  ModelVersion,
  ScanImage,
} from '../../../domain/crop-scans/crop-scan.entities';
import {
  AiInteraction,
  FollowUpAnswer,
  FollowUpQuestion,
} from '../../../domain/follow-up/follow-up.entities';
import { SeverityAssessment, SeverityRuleset } from '../../../domain/severity/severity.entities';
import {
  ActionPlan,
  ActionPlanStep,
  GuidelineApproval,
  GuidelineSource,
  KnowledgeArticle,
  TreatmentGuideline,
} from '../../../domain/knowledge/knowledge.entities';
import {
  CaseStatusHistory,
  Consultation,
  ConsultationMessage,
  ExpertAssignment,
  ExpertReview,
} from '../../../domain/expert-review/expert-review.entities';
import {
  CommunityReport,
  CommunityVerification,
  OutbreakCluster,
  OutbreakMember,
  OutbreakSetting,
  RegionalAdvisory,
} from '../../../domain/outbreaks/outbreak.entities';
import { FieldRiskAssessment, FieldRiskRuleset } from '../../../domain/risk/risk.entities';
import {
  DeviceToken,
  FarmerTask,
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from '../../../domain/notifications/notification.entities';
import {
  AssistantConversation,
  AssistantMessage,
} from '../../../domain/assistant/assistant.entities';
import {
  FieldInspection,
  MutationReceipt,
  SyncChange,
  VoiceNoteMetadata,
} from '../../../domain/sync/sync.entities';
import { AnalyticsEvent, GeneratedReport } from '../../../domain/reports/report.entities';
import {
  FarmIncident,
  FarmIntervention,
  FarmVerification,
} from '../../../domain/digital-twin/digital-twin.entities';
import {
  FarmBrainRun,
  FarmBrainRunEvidence,
  FarmBrainToolCall,
} from '../../../domain/farm-brain/farm-brain.entities';
import {
  Organization,
  PilotUser,
  Subscription,
  SubscriptionPayment,
  UserFeedback,
} from '../../../domain/reports/business-evidence.entities';
import {
  BillingEvent,
  Invoice,
  SubscriptionPlan,
  UsageRecord,
} from '../../../domain/billing/billing.entities';
import {
  LandingPageView,
  LifecycleEmailLog,
  PilotLead,
} from '../../../domain/growth/growth.entities';
import { AIRun } from '../../../domain/ai-ops/ai-run.entity';
export const databaseEntities = [
  User,
  FarmerProfile,
  ExpertProfile,
  Consent,
  Device,
  Crop,
  CropVariety,
  Farm,
  Field,
  CropCycle,
  AuthSession,
  MediaAsset,
  SatelliteCapture,
  SatelliteAnomalyAssessment,
  SatelliteLayer,
  SatelliteStatistics,
  SatelliteStressZone,
  FieldHealthScore,
  IntegrationUsage,
  WeatherSnapshot,
  WeatherForecast,
  CropWeatherRule,
  WeatherRiskAssessment,
  WeatherRiskAlert,
  CropScan,
  ScanImage,
  ImageQualityResult,
  ModelVersion,
  ModelPrediction,
  Diagnosis,
  DiagnosisAlternative,
  FollowUpQuestion,
  FollowUpAnswer,
  AiInteraction,
  SeverityRuleset,
  SeverityAssessment,
  KnowledgeArticle,
  GuidelineSource,
  TreatmentGuideline,
  GuidelineApproval,
  ActionPlan,
  ActionPlanStep,
  ExpertReview,
  ExpertAssignment,
  Consultation,
  ConsultationMessage,
  CaseStatusHistory,
  CommunityReport,
  CommunityVerification,
  OutbreakSetting,
  OutbreakCluster,
  OutbreakMember,
  RegionalAdvisory,
  FieldRiskRuleset,
  FieldRiskAssessment,
  FarmerTask,
  Notification,
  NotificationDelivery,
  DeviceToken,
  NotificationPreference,
  AssistantConversation,
  AssistantMessage,
  MutationReceipt,
  FieldInspection,
  VoiceNoteMetadata,
  SyncChange,
  GeneratedReport,
  AnalyticsEvent,
  FarmIncident,
  FarmIntervention,
  FarmVerification,
  FarmBrainRun,
  FarmBrainRunEvidence,
  FarmBrainToolCall,
  Organization,
  PilotUser,
  Subscription,
  SubscriptionPayment,
  UserFeedback,
  SubscriptionPlan,
  Invoice,
  BillingEvent,
  UsageRecord,
  PilotLead,
  LandingPageView,
  LifecycleEmailLog,
  AIRun,
];

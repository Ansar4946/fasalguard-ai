export enum ExpertCaseStatus {
  Pending = 'PENDING',
  Assigned = 'ASSIGNED',
  InReview = 'IN_REVIEW',
  MoreInfoRequested = 'MORE_INFO_REQUESTED',
  Confirmed = 'CONFIRMED',
  Rejected = 'REJECTED',
  RecommendationProvided = 'RECOMMENDATION_PROVIDED',
  Resolved = 'RESOLVED',
}
export enum ExpertDecision {
  Confirmed = 'CONFIRMED',
  Rejected = 'REJECTED',
}
export enum ConsultationStatus {
  Open = 'OPEN',
  WaitingFarmer = 'WAITING_FARMER',
  WaitingExpert = 'WAITING_EXPERT',
  Closed = 'CLOSED',
}
export enum ConsultationMessageType {
  Text = 'TEXT',
  Image = 'IMAGE',
  VoiceNote = 'VOICE_NOTE',
}

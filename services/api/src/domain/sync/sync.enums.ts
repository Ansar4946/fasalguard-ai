export enum SyncMutationType {
  FieldInspection = 'FIELD_INSPECTION',
  FollowUpAnswers = 'FOLLOW_UP_ANSWERS',
  CropScanMetadata = 'CROP_SCAN_METADATA',
  TaskCompletion = 'TASK_COMPLETION',
  VoiceNoteMetadata = 'VOICE_NOTE_METADATA',
  CommunityReport = 'COMMUNITY_REPORT',
}
export enum MutationReceiptStatus {
  Processing = 'PROCESSING',
  Applied = 'APPLIED',
  Conflict = 'CONFLICT',
  Failed = 'FAILED',
}

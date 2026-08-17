export enum CropScanStatus {
  Created = 'CREATED',
  Uploading = 'UPLOADING',
  ImageValidation = 'IMAGE_VALIDATION',
  Analysing = 'ANALYSING',
  NeedsFollowUp = 'NEEDS_FOLLOW_UP',
  Diagnosed = 'DIAGNOSED',
  ExpertReview = 'EXPERT_REVIEW',
  Verified = 'VERIFIED',
  Resolved = 'RESOLVED',
}
export enum ScanImageCategory {
  LeafFront = 'LEAF_FRONT',
  LeafBack = 'LEAF_BACK',
  WholePlant = 'WHOLE_PLANT',
  FieldContext = 'FIELD_CONTEXT',
  PestImage = 'PEST_IMAGE',
}
export enum ImageQualityIssue {
  Blurry = 'BLURRY',
  TooDark = 'TOO_DARK',
  Overexposed = 'OVEREXPOSED',
  CropNotVisible = 'CROP_NOT_VISIBLE',
  TooDistant = 'TOO_DISTANT',
}

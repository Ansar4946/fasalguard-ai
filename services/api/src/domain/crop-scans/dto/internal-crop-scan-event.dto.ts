import { IsIn, IsUUID } from 'class-validator';

export const CROP_SCAN_EVENTS = ['ANALYSIS_REQUESTED', 'SCREENING_COMPLETED'] as const;
export type CropScanEventName = (typeof CROP_SCAN_EVENTS)[number];

/** Strict: the global ValidationPipe rejects unknown properties (forbidNonWhitelisted). */
export class InternalCropScanEventDto {
  @IsIn(CROP_SCAN_EVENTS) event!: CropScanEventName;
  @IsUUID('4') scanId!: string;
}

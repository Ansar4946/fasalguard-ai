import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { AcquisitionSource, EVENT_FEEDBACK_FEATURES, FeedbackContextType } from '../growth.enums';

const normalizeIdentifier = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreatePilotLeadDto {
  @IsString() @Length(2, 160) name!: string;
  @Transform(normalizeIdentifier) @IsEmail() email!: string;
  @IsOptional() @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phone?: string;
  @IsString() @Length(2, 80) country!: string;
  @IsOptional() @IsNumber() @Min(0) farmSizeAcres?: number;
  @IsString() @Length(1, 80) mainCrop!: string;
  @IsOptional() @IsInt() @Min(0) farmCount?: number;
  @IsOptional() @IsEnum(AcquisitionSource) acquisitionSource?: AcquisitionSource;
}

export class InviteToPilotDto {
  @IsUUID('4') userId!: string;
  @IsOptional() @IsUUID('4') organizationId?: string;
}

export class RespondToPilotInviteDto {
  @IsBoolean() accepted!: boolean;
}

export class SubmitFeedbackDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsString() @Length(1, 4000) feedback!: string;
  @IsEnum(FeedbackContextType) contextType!: FeedbackContextType;
  @IsOptional() @IsUUID('4') contextId?: string;
  @IsOptional() @IsBoolean() consentToQuote?: boolean;
}

export class SubmitEventFeedbackDto {
  @IsIn(EVENT_FEEDBACK_FEATURES) feature!: FeedbackContextType;
  @IsOptional() @IsUUID('4') contextId?: string;
  @IsOptional() @IsUUID('4') farmId?: string;
  @IsBoolean() useful!: boolean;
  @IsOptional() @IsBoolean() wouldRecommend?: boolean;
  @IsOptional() @IsString() @Length(1, 2000) whatHelped?: string;
  @IsOptional() @IsString() @Length(1, 2000) whatImprove?: string;
  @IsOptional() @IsBoolean() permissionToQuote?: boolean;
}

export class PublishFeedbackDto {
  @IsOptional() @IsUrl({ require_tld: false }) publicReferenceUrl?: string;
}

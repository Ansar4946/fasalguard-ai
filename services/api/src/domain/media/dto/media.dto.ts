import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { MediaPurpose } from '../media.enums';

const normalizeMime = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class PresignUploadDto {
  @IsString() @Length(1, 180) fileName!: string;
  @Transform(normalizeMime) @IsString() @Length(3, 120) contentType!: string;
  @IsInt() @Min(1) @Max(104_857_600) sizeBytes!: number;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/i) checksum?: string;
  @IsEnum(MediaPurpose) purpose!: MediaPurpose;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CompleteUploadDto {
  @IsUUID('4') mediaId!: string;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/i) checksum?: string;
}

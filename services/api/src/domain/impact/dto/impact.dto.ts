import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { VerificationStatus } from '../../digital-twin/digital-twin.enums';

export class ConfirmIncidentDto {
  @ApiProperty()
  @IsBoolean()
  confirmed!: boolean;
}

export class ExpertConfirmIncidentDto {
  @ApiProperty()
  @IsBoolean()
  confirmed!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RecordFollowUpDto {
  @ApiProperty({ enum: VerificationStatus })
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  cropScanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  satelliteCaptureId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  fieldInspectionId?: string;
}

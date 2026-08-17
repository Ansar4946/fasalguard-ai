import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ConsultationMessageType } from '../expert-review.enums';
export class AssignExpertDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') expertId?: string;
}
export class ExpertDecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) condition?: string;
  @ApiProperty() @IsString() @MaxLength(4000) notes!: string;
}
export class MoreInfoDto {
  @ApiProperty() @IsString() @MaxLength(4000) request!: string;
}
export class RecommendationDto {
  @ApiProperty() @IsString() @MaxLength(10000) recommendation!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') guidelineId?: string;
}
export class ResolveCaseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
export class CreateConsultationDto {
  @ApiProperty() @IsString() @MaxLength(220) subject!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') scanId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') expertId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) initialMessage?: string;
}
export class CreateConsultationMessageDto {
  @ApiProperty({ enum: ConsultationMessageType })
  @IsEnum(ConsultationMessageType)
  type!: ConsultationMessageType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) text?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') mediaAssetId?: string;
}

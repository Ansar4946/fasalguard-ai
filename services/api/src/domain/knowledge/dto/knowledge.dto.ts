import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { GuidelineStatus } from '../knowledge.enums';
export class CreateSourceDto {
  @ApiProperty() @IsString() @MaxLength(220) title!: string;
  @ApiProperty() @IsString() @MaxLength(4000) citation!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) url?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() publishedAt?: string;
}
export class UpdateSourceDto extends PartialType(CreateSourceDto) {}
export class CreateArticleDto {
  @ApiProperty() @IsString() @MaxLength(220) title!: string;
  @ApiProperty() @IsString() @MaxLength(50000) content!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) languageCode?: string;
}
export class UpdateArticleDto extends PartialType(CreateArticleDto) {}
export class CreateGuidelineDto {
  @ApiProperty() @IsUUID('4') cropId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') cropVarietyId?: string;
  @ApiProperty() @IsString() @MaxLength(200) condition!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) growthStage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) severity?: string;
  @ApiProperty() @IsArray() @IsString({ each: true }) immediateActions!: string[];
  @ApiProperty() @IsArray() @IsString({ each: true }) preventiveActions!: string[];
  @ApiProperty() @IsArray() @IsString({ each: true }) monitoringActions!: string[];
  @ApiProperty() @IsArray() @IsString({ each: true }) expertEscalationCriteria!: string[];
  @ApiPropertyOptional() @IsOptional() @IsObject() chemicalGuidance?: Record<string, unknown>;
  @ApiProperty() @IsUUID('4') sourceId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() reviewDueAt?: string;
}
export class UpdateGuidelineDto extends PartialType(CreateGuidelineDto) {}
export class ReviewGuidelineDto {
  @ApiProperty({ enum: GuidelineStatus }) @IsEnum(GuidelineStatus) status!: GuidelineStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  approveChemicalGuidance?: boolean;
}

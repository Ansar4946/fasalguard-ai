import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { CommunityReportSource, CommunityVerificationAnswer } from '../outbreak.enums';
export class CreateCommunityReportDto {
  @ApiProperty({ enum: CommunityReportSource })
  @IsEnum(CommunityReportSource)
  source!: CommunityReportSource;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') scanId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') fieldId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') cropId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/^[\p{L}\p{N} _-]+$/u)
  conditionFamily?: string;
}
export class VerifyCommunityReportDto {
  @ApiProperty({ enum: CommunityVerificationAnswer })
  @IsEnum(CommunityVerificationAnswer)
  answer!: CommunityVerificationAnswer;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') mediaAssetId?: string;
}

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ReportType } from '../report.enums';
export class CreateReportDto {
  @IsEnum(ReportType) type!: ReportType;
  @IsOptional() @IsUUID('4') resourceId?: string;
  @IsOptional() @IsDateString({ strict: true }) from?: string;
  @IsOptional() @IsDateString({ strict: true }) to?: string;
  @IsOptional() @IsString() @Length(8, 180) idempotencyKey?: string;
}
export class ReportPageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsDateString({ strict: true }) cursor?: string;
}

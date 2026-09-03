import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class MarketPricesQueryDto {
  @IsOptional() @IsString() @MaxLength(120) crop?: string;
  @IsOptional() @IsString() @MaxLength(120) district?: string;
  @IsOptional() @IsString() @MaxLength(80) province?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class MarketHistoryQueryDto {
  @IsString() @MaxLength(120) crop!: string;
  @IsOptional() @IsString() @MaxLength(160) market?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(365) days = 30;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(500) limit = 200;
}

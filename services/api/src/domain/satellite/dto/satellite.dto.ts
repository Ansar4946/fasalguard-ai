import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';
export class CreateSatelliteScanDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxCloudCoverage?: number;
}

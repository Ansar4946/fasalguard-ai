import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class StartFarmBrainInvestigationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  fieldId?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ScanImageCategory } from '../crop-scan.enums';
export class CreateCropScanDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') fieldId?: string;
}
export class AddScanImageDto {
  @ApiProperty() @IsUUID('4') mediaId!: string;
  @ApiProperty({ enum: ScanImageCategory }) @IsEnum(ScanImageCategory) category!: ScanImageCategory;
}

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import type { Polygon } from 'geojson';
import { CropCycleStatus } from '../farm.enums';

export class CropCycleInputDto {
  @IsUUID('4') cropId!: string;
  @IsOptional() @IsUUID('4') varietyId?: string;
  @IsOptional() @IsDateString({ strict: true }) sowingDate?: string;
  @IsOptional() @IsDateString({ strict: true }) expectedHarvestDate?: string;
  @IsOptional() @IsString() @Length(1, 80) growthStage?: string;
  @IsEnum(CropCycleStatus) status!: CropCycleStatus;
}

export class CreateFarmDto {
  @IsString() @Length(2, 160) name!: string;
  @IsObject() boundary!: Polygon;
  @IsOptional() @IsString() @Length(1, 120) province?: string;
  @IsOptional() @IsString() @Length(1, 120) district?: string;
  @IsOptional() @IsString() @Length(1, 120) tehsil?: string;
  @IsOptional() @IsString() @Length(1, 120) soilType?: string;
  @IsOptional() @IsString() @Length(1, 120) irrigationType?: string;
  @IsOptional() @IsString() @Length(1, 120) waterSource?: string;
}

export class UpdateFarmDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsObject() boundary?: Polygon;
  @IsOptional() @IsString() @Length(1, 120) province?: string;
  @IsOptional() @IsString() @Length(1, 120) district?: string;
  @IsOptional() @IsString() @Length(1, 120) tehsil?: string;
  @IsOptional() @IsString() @Length(1, 120) soilType?: string;
  @IsOptional() @IsString() @Length(1, 120) irrigationType?: string;
  @IsOptional() @IsString() @Length(1, 120) waterSource?: string;
}

export class CreateFieldDto {
  @IsString() @Length(2, 160) name!: string;
  @IsObject() boundary!: Polygon;
  @IsOptional()
  @ValidateNested()
  @Type(() => CropCycleInputDto)
  currentCropCycle?: CropCycleInputDto;
}

export class UpdateFieldDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsObject() boundary?: Polygon;
  @IsOptional()
  @ValidateNested()
  @Type(() => CropCycleInputDto)
  currentCropCycle?: CropCycleInputDto;
}

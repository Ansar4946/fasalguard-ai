import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { AcquisitionSource } from '../growth.enums';

const normalizeIdentifier = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreatePilotLeadDto {
  @IsString() @Length(2, 160) name!: string;
  @Transform(normalizeIdentifier) @IsEmail() email!: string;
  @IsOptional() @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phone?: string;
  @IsString() @Length(2, 80) country!: string;
  @IsOptional() @IsNumber() @Min(0) farmSizeAcres?: number;
  @IsString() @Length(1, 80) mainCrop!: string;
  @IsOptional() @IsInt() @Min(0) farmCount?: number;
  @IsOptional() @IsEnum(AcquisitionSource) acquisitionSource?: AcquisitionSource;
}

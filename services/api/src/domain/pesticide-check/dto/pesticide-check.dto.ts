import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** NUL and other C0/DEL control characters are never valid label text and PostgreSQL rejects NUL. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const NO_CONTROL_CHARS = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePesticideCheckDto {
  @IsUUID('4') mediaAssetId!: string;
  @IsOptional() @IsIn(['en', 'ur']) language?: 'en' | 'ur';
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(10_000_000) priceRs?: number;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  @Matches(NO_CONTROL_CHARS)
  packSize?: string;
}

export class ManualPesticideCheckDto {
  @Transform(trim) @IsString() @Length(2, 120) @Matches(NO_CONTROL_CHARS) brandName!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  @Matches(NO_CONTROL_CHARS)
  activeIngredient?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  @Matches(NO_CONTROL_CHARS)
  registrationNo?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(4, 20)
  @Matches(NO_CONTROL_CHARS)
  expiryDate?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(10_000_000) priceRs?: number;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  @Matches(NO_CONTROL_CHARS)
  packSize?: string;
  @IsOptional() @IsIn(['en', 'ur']) language?: 'en' | 'ur';
}

export class ListPesticideChecksQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 80)
  search?: string;
}

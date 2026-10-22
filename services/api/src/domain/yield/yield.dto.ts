import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : value;

export class YieldReferenceQueryDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(64) crop!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(64) district!: string;
}

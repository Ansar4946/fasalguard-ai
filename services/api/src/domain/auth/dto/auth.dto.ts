import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ConsentType, DevicePlatform } from '../../identity/identity.enums';
const normalizeIdentifier = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
export class ConsentInputDto {
  @IsEnum(ConsentType) type!: ConsentType;
  @IsString() @Length(1, 32) policyVersion!: string;
  @IsBoolean() granted!: boolean;
}
export class DeviceInputDto {
  @IsString() @Length(8, 180) deviceIdentifier!: string;
  @IsEnum(DevicePlatform) platform!: DevicePlatform;
}
export class RegisterDto {
  @Transform(normalizeIdentifier)
  @IsEmail()
  email!: string;
  @IsString() @Length(12, 128) password!: string;
  @IsString() @Length(2, 160) fullName!: string;
  @IsOptional() @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phone?: string;
  @IsOptional() @IsString() @Length(2, 16) preferredLanguage?: string;
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  consents!: ConsentInputDto[];
  @ValidateNested() @Type(() => DeviceInputDto) device!: DeviceInputDto;
}
export class LoginDto {
  @Transform(normalizeIdentifier)
  @IsString()
  @IsNotEmpty()
  identifier!: string;
  @IsString() @Length(1, 128) password!: string;
  @ValidateNested() @Type(() => DeviceInputDto) device!: DeviceInputDto;
}
export class RefreshDto {
  @IsString() @Length(64, 512) refreshToken!: string;
}
export class LogoutDto {
  @IsString() @Length(64, 512) refreshToken!: string;
}
export class ForgotPasswordDto {
  @Transform(normalizeIdentifier)
  @IsString()
  @MaxLength(320)
  identifier!: string;
}

import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

export class SetupUssdPinDto {
  @IsString()
  @Length(8, 128)
  currentPassword!: string;

  @IsString()
  @Matches(/^\d{4,6}$/)
  pin!: string;
}

export class UssdCallbackDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{1,120}$/)
  eventId!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{1,120}$/)
  sessionId!: string;

  @Transform(({ value }): unknown => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber!: string;

  @IsString()
  @MaxLength(32)
  input!: string;
}

export class UssdDemoCallbackDto {
  @IsUUID('4')
  eventId!: string;

  @IsUUID('4')
  sessionId!: string;

  @IsString()
  @MaxLength(32)
  input!: string;
}

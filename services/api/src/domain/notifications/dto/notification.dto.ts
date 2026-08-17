import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { PushPlatform, TaskSource, TaskStatus } from '../notification.enums';
export class RegisterPushTokenDto {
  @IsString() @Length(20, 4096) token!: string;
  @IsEnum(PushPlatform) platform!: PushPlatform;
  @IsOptional() @IsUUID('4') deviceId?: string;
}
export class CreateTaskDto {
  @IsString() @Length(2, 160) title!: string;
  @IsOptional() @IsString() @Length(1, 4000) description?: string;
  @IsOptional() @IsUUID('4') fieldId?: string;
  @IsOptional() @IsDateString({ strict: true }) dueAt?: string;
}
export class UpdateTaskDto {
  @IsOptional() @IsString() @Length(2, 160) title?: string;
  @IsOptional() @IsString() @Length(1, 4000) description?: string;
  @IsOptional() @IsDateString({ strict: true }) dueAt?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
}
export class UpdatePreferenceDto {
  @IsBoolean() pushEnabled!: boolean;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) quietHoursStart?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) quietHoursEnd?: string;
  @IsOptional() @IsString() @Length(1, 64) timezone?: string;
}
export { TaskSource };

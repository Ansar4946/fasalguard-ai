import {
  Equals,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { VOICE_CONSENT_VERSION } from '../providers/speech.provider';
/** NUL and other C0/DEL control characters (tab, LF and CR are allowed) are never valid farmer text and PostgreSQL rejects NUL. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const NO_CONTROL_CHARS = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
const HAS_VISIBLE_CHAR = /\S/;
export class CreateConversationDto {
  @IsOptional() @IsUUID('4') farmId?: string;
  @IsOptional() @IsUUID('4') fieldId?: string;
  @IsOptional()
  @IsString()
  @Length(2, 160)
  @Matches(NO_CONTROL_CHARS, { message: 'title must not contain control characters' })
  title?: string;
}
export class SendAssistantMessageDto {
  @IsString()
  @Length(1, 4000)
  @Matches(NO_CONTROL_CHARS, { message: 'message must not contain control characters' })
  @Matches(HAS_VISIBLE_CHAR, { message: 'message must not be empty or whitespace only' })
  message!: string;
  @IsOptional() @IsIn(['en', 'ur', 'hi']) language?: string;
  /** Client-generated; a retry with the same key returns the stored answer instead of a new one. */
  @IsOptional() @IsUUID('4') idempotencyKey?: string;
}
export class TranscribeVoiceDto {
  @IsUUID('4') mediaAssetId!: string;
  @IsIn(['en', 'ur', 'hi']) language!: string;
  @Equals(true, { message: 'Recording consent is required.' }) consent!: true;
  @Equals(VOICE_CONSENT_VERSION) consentVersion!: string;
}
export class SynthesizeSpeechDto {
  @IsString()
  @Length(1, 2000)
  @Matches(NO_CONTROL_CHARS, { message: 'text must not contain control characters' })
  @Matches(HAS_VISIBLE_CHAR, { message: 'text must not be empty or whitespace only' })
  text!: string;
  @IsIn(['en', 'ur', 'hi']) language!: string;
  @Equals(VOICE_CONSENT_VERSION) consentVersion!: string;
}
export class VoiceConsentDto {
  @IsBoolean() granted!: boolean;
  @Equals(VOICE_CONSENT_VERSION) consentVersion!: string;
}

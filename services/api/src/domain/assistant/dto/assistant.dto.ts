import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
export class CreateConversationDto {
  @IsOptional() @IsUUID('4') farmId?: string;
  @IsOptional() @IsUUID('4') fieldId?: string;
  @IsOptional() @IsString() @Length(2, 160) title?: string;
}
export class SendAssistantMessageDto {
  @IsString() @Length(1, 4000) message!: string;
}
export class TranscribeVoiceDto {
  @IsUUID('4') mediaAssetId!: string;
  @IsOptional() @IsIn(['en', 'ur', 'pa']) language?: string;
}
export class SynthesizeSpeechDto {
  @IsString() @Length(1, 2000) text!: string;
  @IsOptional() @IsIn(['en', 'ur', 'pa']) language?: string;
}

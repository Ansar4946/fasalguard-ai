import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { AssistantService } from './assistant.service';
/* Controller responses are inferred from the application service. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  CreateConversationDto,
  SendAssistantMessageDto,
  SynthesizeSpeechDto,
  TranscribeVoiceDto,
  VoiceConsentDto,
} from './dto/assistant.dto';
@ApiTags('AI agriculture assistant')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'assistant' })
export class AssistantController {
  constructor(private readonly service: AssistantService) {}
  /** Owner-scoped unread warning counts and the three newest titles. Read-only. */
  @Get('briefing') briefing(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.briefing(p.userId);
  }
  @Get('speech/capabilities') capabilities(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.speechCapabilities(p.userId);
  }
  @Post('speech/consent') consent(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: VoiceConsentDto,
  ) {
    return this.service.setVoiceConsent(p.userId, d);
  }
  @Post('conversations') create(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: CreateConversationDto,
  ) {
    return this.service.create(p.userId, d);
  }
  @Get('conversations') list(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.list(p.userId);
  }
  @Get('conversations/:id') get(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.get(p.userId, id);
  }
  @Post('conversations/:id/messages') @Throttle({ default: { limit: 20, ttl: 60_000 } }) message(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: SendAssistantMessageDto,
  ) {
    return this.service.message(p.userId, id, d);
  }
  @Post('speech/transcribe') @Throttle({ default: { limit: 10, ttl: 60_000 } }) transcribe(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: TranscribeVoiceDto,
  ) {
    return this.service.transcribe(p.userId, d);
  }
  @Post('speech/synthesize') @Throttle({ default: { limit: 20, ttl: 60_000 } }) synthesize(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: SynthesizeSpeechDto,
  ) {
    return this.service.synthesize(p.userId, d);
  }
}

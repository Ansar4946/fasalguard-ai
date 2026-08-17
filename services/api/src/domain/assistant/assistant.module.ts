import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaModule } from '../media/media.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AGRICULTURE_ASSISTANT_PROVIDER } from './providers/agriculture-assistant.provider';
import { FakeAssistantProvider } from './providers/fake-assistant.provider';
import { FakeSpeechProvider } from './providers/fake-speech.provider';
import { QwenAssistantProvider } from './providers/qwen-assistant.provider';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { QwenSpeechProvider } from './providers/qwen-speech.provider';
import { SPEECH_TO_TEXT_PROVIDER, TEXT_TO_SPEECH_PROVIDER } from './providers/speech.provider';
@Module({
  imports: [MediaModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    FakeAssistantProvider,
    FakeSpeechProvider,
    QwenAssistantProvider,
    QwenSpeechProvider,
    {
      provide: AGRICULTURE_ASSISTANT_PROVIDER,
      inject: [ConfigService, FakeAssistantProvider, QwenAssistantProvider],
      useFactory: (c: ConfigService, f: FakeAssistantProvider, q: QwenAssistantProvider) =>
        c.get('assistantProvider', 'fake') === 'qwen' ? q : f,
    },
    {
      provide: SPEECH_TO_TEXT_PROVIDER,
      inject: [ConfigService, FakeSpeechProvider, QwenSpeechProvider],
      useFactory: (c: ConfigService, f: FakeSpeechProvider, q: QwenSpeechProvider) =>
        c.get('speechProvider', 'fake') === 'qwen' ? q : f,
    },
    {
      provide: TEXT_TO_SPEECH_PROVIDER,
      inject: [ConfigService, FakeSpeechProvider, QwenSpeechProvider],
      useFactory: (c: ConfigService, f: FakeSpeechProvider, q: QwenSpeechProvider) =>
        c.get('speechProvider', 'fake') === 'qwen' ? q : f,
    },
  ],
})
export class AssistantModule {}

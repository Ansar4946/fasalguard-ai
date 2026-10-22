import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaModule } from '../media/media.module';
import { FarmFinanceModule } from '../farm-finance/farm-finance.module';
import { FarmManagementModule } from '../farms/farm-management.module';
import { NotificationModule } from '../notifications/notification.module';
import { PersonalContextService } from './personal-context.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AGRICULTURE_ASSISTANT_PROVIDER } from './providers/agriculture-assistant.provider';
import { FakeAssistantProvider } from './providers/fake-assistant.provider';
import { FakeSpeechProvider } from './providers/fake-speech.provider';
import { QwenAssistantProvider } from './providers/qwen-assistant.provider';
import { ExtractiveAssistantProvider } from './providers/extractive-assistant.provider';
import { GeminiAssistantProvider } from './providers/gemini-assistant.provider';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { QwenSpeechProvider } from './providers/qwen-speech.provider';
import { AzureSpeechProvider } from './providers/azure-speech.provider';
import { AssemblyAiSpeechProvider } from './providers/assemblyai-speech.provider';
import { SPEECH_TO_TEXT_PROVIDER, TEXT_TO_SPEECH_PROVIDER } from './providers/speech.provider';
@Module({
  imports: [MediaModule, FarmManagementModule, FarmFinanceModule, NotificationModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    PersonalContextService,
    FakeAssistantProvider,
    FakeSpeechProvider,
    QwenAssistantProvider,
    GeminiAssistantProvider,
    ExtractiveAssistantProvider,
    KnowledgeRetrievalService,
    QwenSpeechProvider,
    AzureSpeechProvider,
    AssemblyAiSpeechProvider,
    {
      provide: AGRICULTURE_ASSISTANT_PROVIDER,
      inject: [
        ConfigService,
        FakeAssistantProvider,
        QwenAssistantProvider,
        GeminiAssistantProvider,
        ExtractiveAssistantProvider,
      ],
      useFactory: (
        c: ConfigService,
        f: FakeAssistantProvider,
        q: QwenAssistantProvider,
        g: GeminiAssistantProvider,
        x: ExtractiveAssistantProvider,
      ) => {
        const choice = c.get<string>('assistantProvider', 'fake');
        return choice === 'qwen' ? q : choice === 'gemini' ? g : choice === 'extractive' ? x : f;
      },
    },
    {
      provide: SPEECH_TO_TEXT_PROVIDER,
      inject: [
        ConfigService,
        FakeSpeechProvider,
        QwenSpeechProvider,
        AzureSpeechProvider,
        AssemblyAiSpeechProvider,
      ],
      // SPEECH_STT_PROVIDER selects speech-to-text independently; text-to-speech follows SPEECH_PROVIDER.
      useFactory: (
        c: ConfigService,
        f: FakeSpeechProvider,
        q: QwenSpeechProvider,
        a: AzureSpeechProvider,
        s: AssemblyAiSpeechProvider,
      ) =>
        c.get('speechSttProvider', '') === 'assemblyai'
          ? s
          : c.get('speechProvider', 'fake') === 'azure'
            ? a
            : c.get('speechProvider', 'fake') === 'qwen'
              ? q
              : f,
    },
    {
      provide: TEXT_TO_SPEECH_PROVIDER,
      inject: [ConfigService, FakeSpeechProvider, QwenSpeechProvider, AzureSpeechProvider],
      useFactory: (
        c: ConfigService,
        f: FakeSpeechProvider,
        q: QwenSpeechProvider,
        a: AzureSpeechProvider,
      ) =>
        c.get('speechProvider', 'fake') === 'azure'
          ? a
          : c.get('speechProvider', 'fake') === 'qwen'
            ? q
            : f,
    },
  ],
})
export class AssistantModule {}

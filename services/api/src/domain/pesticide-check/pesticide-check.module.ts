/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiOpsModule } from '../ai-ops/ai-ops.module';
import { MediaModule } from '../media/media.module';
import { PesticideCheckController, PesticideProductController } from './pesticide-check.controller';
import { PesticideCheckService } from './pesticide-check.service';
import { FakeLabelReaderProvider } from './providers/fake-label-reader.provider';
import { selectLabelReader } from './providers/label-reader.factory';
import { LABEL_READER_PROVIDER } from './providers/label-reader.provider';
import { OpenAICompatibleVisionLabelReaderProvider } from './providers/openai-compatible-vision-label-reader.provider';
import { TesseractLabelReaderProvider } from './providers/tesseract-label-reader.provider';

/** Dawai Check. Only registered by AppModule when DAWAI_CHECK_ENABLED=true; otherwise the routes do not exist. */
@Module({
  imports: [MediaModule, AiOpsModule],
  controllers: [PesticideCheckController, PesticideProductController],
  providers: [
    PesticideCheckService,
    FakeLabelReaderProvider,
    {
      provide: TesseractLabelReaderProvider,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => new TesseractLabelReaderProvider(c),
    },
    {
      provide: OpenAICompatibleVisionLabelReaderProvider,
      inject: [ConfigService, TesseractLabelReaderProvider],
      useFactory: (c: ConfigService, t: TesseractLabelReaderProvider) =>
        new OpenAICompatibleVisionLabelReaderProvider(c, t),
    },
    {
      provide: LABEL_READER_PROVIDER,
      inject: [
        ConfigService,
        FakeLabelReaderProvider,
        TesseractLabelReaderProvider,
        OpenAICompatibleVisionLabelReaderProvider,
      ],
      useFactory: (
        c: ConfigService,
        fake: FakeLabelReaderProvider,
        tesseract: TesseractLabelReaderProvider,
        vision: OpenAICompatibleVisionLabelReaderProvider,
      ) =>
        selectLabelReader(c.get<string>('labelReaderProvider', 'tesseract'), {
          fake,
          tesseract,
          openaiCompatible: vision,
        }),
    },
  ],
})
export class PesticideCheckModule {}

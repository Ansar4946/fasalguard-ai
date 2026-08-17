import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ASSISTANT_PROMPT,
  EXPLANATION_PROMPT,
  PROMPT_VERSION,
  QUESTION_PROMPT,
  SUMMARY_PROMPT,
  TRANSLATION_PROMPT,
} from '../prompts';
import type { AllowedQuestion } from '../question-library';
import type {
  AnswerSummary,
  AssistantResponse,
  FarmerExplanation,
  LlmProvider,
  LlmResult,
  QuestionSelection,
} from './llm.provider';
import {
  parseAnswerSummary,
  parseAssistant,
  parseExplanation,
  parseQuestionSelection,
  parseTranslation,
  rejectRestrictedClaims,
} from './llm-output.validation';
interface QwenResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
}
@Injectable()
export class AlibabaQwenProvider implements LlmProvider {
  constructor(private readonly config: ConfigService) {}
  selectQuestions(input: {
    context: Record<string, unknown>;
    allowedQuestions: readonly AllowedQuestion[];
  }): Promise<LlmResult<QuestionSelection>> {
    const allowed = new Set(input.allowedQuestions.map((x) => x.key));
    return this.call(
      QUESTION_PROMPT,
      { farmer_data: input.context, allowed_questions: input.allowedQuestions },
      (x) => parseQuestionSelection(x, allowed),
    );
  }
  summarizeAnswers(input: {
    answers: Array<{ question: string; answer: string }>;
  }): Promise<LlmResult<AnswerSummary>> {
    return this.call(
      SUMMARY_PROMPT,
      { farmer_data: { answers: input.answers } },
      parseAnswerSummary,
    );
  }
  explainResult(input: {
    visionResult: Record<string, unknown>;
    answerSummary?: AnswerSummary;
    context: Record<string, unknown>;
  }): Promise<LlmResult<FarmerExplanation>> {
    return this.call(
      EXPLANATION_PROMPT,
      {
        vision_screening: input.visionResult,
        farmer_data: { answerSummary: input.answerSummary ?? null, context: input.context },
      },
      parseExplanation,
    );
  }
  translateApprovedInformation(input: {
    approvedText: string;
    targetLanguage: string;
  }): Promise<LlmResult<{ translation: string }>> {
    return this.call(
      TRANSLATION_PROMPT,
      { approved_text: input.approvedText, target_language: input.targetLanguage },
      parseTranslation,
    );
  }
  respondToContext(input: {
    farmerMessage: string;
    approvedContext: Record<string, unknown>;
  }): Promise<LlmResult<AssistantResponse>> {
    return this.call(
      ASSISTANT_PROMPT,
      { farmer_data: { message: input.farmerMessage }, approved_context: input.approvedContext },
      parseAssistant,
    );
  }
  private async call<T>(
    system: string,
    data: unknown,
    parse: (value: unknown) => T,
  ): Promise<LlmResult<T>> {
    const apiKey = this.config.get<string>('qwenApiKey', '');
    if (!apiKey) throw new Error('Alibaba Qwen provider selected without an API key.');
    const model = this.config.get<string>('qwenModel', 'qwen-plus');
    const response = await fetch(
      new URL(
        '/compatible-mode/v1/chat/completions',
        this.config.get<string>('qwenBaseUrl', 'https://dashscope-intl.aliyuncs.com'),
      ),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(data) },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new Error('Qwen request failed.');
    const raw = (await response.json()) as QwenResponse;
    const content = raw.choices?.[0]?.message?.content;
    if (!content) throw new Error('Qwen returned an empty response.');
    let decoded: unknown;
    try {
      decoded = JSON.parse(content);
    } catch {
      throw new Error('Qwen returned malformed JSON.');
    }
    const output = parse(decoded);
    rejectRestrictedClaims(output);
    return {
      output,
      modelId: model,
      modelVersion: PROMPT_VERSION,
      inferenceTimestamp: new Date().toISOString(),
      rawProviderResponse: raw as Record<string, unknown>,
    };
  }
}

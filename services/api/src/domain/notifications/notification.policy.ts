import { BadRequestException, Injectable } from '@nestjs/common';
@Injectable()
export class NotificationSafetyPolicy {
  private readonly emergency = /\b(emergency|urgent danger|immediate threat|critical emergency)\b/i;
  assertSafe(input: {
    title: string;
    body: string;
    confirmedEvidence: boolean;
    aiConfidence: number | null;
  }): void {
    if (
      this.emergency.test(`${input.title} ${input.body}`) &&
      (!input.confirmedEvidence || (input.aiConfidence !== null && input.aiConfidence < 0.85))
    )
      throw new BadRequestException(
        'Emergency wording requires confirmed, sufficiently confident evidence.',
      );
  }
}

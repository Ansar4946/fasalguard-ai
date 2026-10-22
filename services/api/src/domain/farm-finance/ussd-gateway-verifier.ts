import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UssdCallbackDto } from './dto/farm-finance.dto';

@Injectable()
export class UssdGatewayVerifier {
  constructor(private readonly config: ConfigService) {}

  verify(dto: UssdCallbackDto, timestampHeader?: string, signatureHeader?: string): string {
    if (!this.config.get<boolean>('ussdEnabled', false))
      throw new ServiceUnavailableException({
        code: 'USSD_DISABLED',
        message: 'USSD is unavailable.',
      });
    const secret = this.config.get<string>('ussdCallbackSecret', '');
    if (!secret)
      throw new ServiceUnavailableException({
        code: 'USSD_GATEWAY_UNCONFIGURED',
        message: 'USSD is unavailable.',
      });
    if (!timestampHeader || !/^\d{10,13}$/.test(timestampHeader) || !signatureHeader)
      throw new UnauthorizedException({
        code: 'INVALID_GATEWAY_SIGNATURE',
        message: 'Invalid callback.',
      });
    const rawTimestamp = Number(timestampHeader);
    const timestampMs = timestampHeader.length === 10 ? rawTimestamp * 1000 : rawTimestamp;
    if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > 300_000)
      throw new UnauthorizedException({
        code: 'STALE_GATEWAY_CALLBACK',
        message: 'Invalid callback.',
      });
    const canonical = UssdGatewayVerifier.canonical(dto);
    const expected = createHmac('sha256', secret)
      .update(`${timestampHeader}.${canonical}`)
      .digest('hex');
    const supplied = signatureHeader.toLowerCase().replace(/^sha256=/, '');
    const a = Buffer.from(expected, 'hex');
    const b = /^[a-f0-9]{64}$/.test(supplied) ? Buffer.from(supplied, 'hex') : Buffer.alloc(0);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException({
        code: 'INVALID_GATEWAY_SIGNATURE',
        message: 'Invalid callback.',
      });
    return canonical;
  }

  static canonical(dto: UssdCallbackDto): string {
    return JSON.stringify({
      eventId: dto.eventId,
      input: dto.input,
      phoneNumber: dto.phoneNumber,
      sessionId: dto.sessionId,
    });
  }
}

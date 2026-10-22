import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { UssdGatewayVerifier } from '../src/domain/farm-finance/ussd-gateway-verifier';

const dto = { eventId: 'event-1', sessionId: 'session-1', phoneNumber: '+923001234567', input: '' };

describe('F09 USSD gateway verifier', () => {
  it('fails closed when the channel is disabled', () => {
    const verifier = new UssdGatewayVerifier(new ConfigService({ ussdEnabled: false }));
    expect(() => verifier.verify(dto, '1', 'bad')).toThrow(ServiceUnavailableException);
  });

  it('accepts only a current signature over the canonical callback fields', () => {
    const secret = 'test-only-secret-with-more-than-32-chars';
    const verifier = new UssdGatewayVerifier(
      new ConfigService({ ussdEnabled: true, ussdCallbackSecret: secret }),
    );
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${UssdGatewayVerifier.canonical(dto)}`)
      .digest('hex');
    expect(verifier.verify(dto, timestamp, signature)).toBe(UssdGatewayVerifier.canonical(dto));
    expect(() => verifier.verify({ ...dto, input: '1' }, timestamp, signature)).toThrow(
      UnauthorizedException,
    );
    expect(() => verifier.verify(dto, String(Date.now() - 600_000), signature)).toThrow(
      UnauthorizedException,
    );
  });
});

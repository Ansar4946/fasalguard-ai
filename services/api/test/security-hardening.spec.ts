import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { securityHeaders } from '../src/common/middleware/security.middleware';
import { environmentSchema } from '../src/config/environment';
import { UserRole } from '../src/domain/identity/identity.enums';
import { ReportType } from '../src/domain/reports/report.enums';
import { ReportService } from '../src/domain/reports/report.service';
import { MediaService } from '../src/domain/media/media.service';

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://service:secret@db:5432/fasalguard',
  REDIS_URL: 'rediss://cache:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(64),
  CORS_ORIGINS: 'https://app.fasalguard.example',
  ENABLE_SWAGGER: false,
  OTP_PROVIDER: 'production',
  OBJECT_STORAGE_PROVIDER: 'alibaba',
  OSS_REGION: 'oss-ap-southeast-1',
  OSS_BUCKET: 'private-fasalguard',
  OSS_ACCESS_KEY_ID: 'runtime-id',
  OSS_ACCESS_KEY_SECRET: 'runtime-secret',
  METRICS_TOKEN: 'metrics-observer-token',
};

describe('production security hardening', () => {
  it('rejects unsafe production configuration', () => {
    expect(
      environmentSchema.validate({ ...productionEnvironment, CORS_ORIGINS: '*' }).error,
    ).toBeDefined();
    expect(
      environmentSchema.validate({ ...productionEnvironment, ENABLE_SWAGGER: true }).error,
    ).toBeDefined();
    expect(
      environmentSchema.validate({
        ...productionEnvironment,
        JWT_ACCESS_SECRET: 'replace-with-development-secret',
      }).error,
    ).toBeDefined();
  });
  it('accepts explicit production origins and runtime storage credentials', () => {
    expect(environmentSchema.validate(productionEnvironment).error).toBeUndefined();
  });
  it('rejects plaintext or credential-bearing production provider URLs', () => {
    expect(
      environmentSchema.validate({
        ...productionEnvironment,
        OPEN_METEO_BASE_URL: 'http://api.open-meteo.com',
      }).error,
    ).toBeDefined();
    expect(
      environmentSchema.validate({
        ...productionEnvironment,
        QWEN_BASE_URL: 'https://user:secret@dashscope-intl.aliyuncs.com',
      }).error,
    ).toBeDefined();
  });
  it('sets restrictive API headers and removes framework disclosure', () => {
    const headers = new Map<string, string>();
    const removeHeader = jest.fn();
    const response = {
      setHeader: jest.fn((key: string, value: string) => headers.set(key, value)),
      removeHeader,
    } as unknown as Response;
    const next = jest.fn() as NextFunction;
    securityHeaders({} as Request, response, next);
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(next).toHaveBeenCalled();
  });
  it('does not issue a signed URL for media owned by another user', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const storage = { createAccessUrl: jest.fn() };
    const config = { get: jest.fn() };
    const service = new MediaService(db as never, storage as never, config as never);
    await expect(
      service.accessUrl(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(storage.createAccessUrl).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('owner_id=$2'), [
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });
  it('prevents an expert from generating a report for an unassigned case', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const queue = { add: jest.fn() };
    const storage = {};
    const config = { get: jest.fn() };
    const service = new ReportService(
      db as never,
      queue as never,
      storage as never,
      config as never,
    );
    await expect(
      service.create(
        {
          userId: '00000000-0000-4000-8000-000000000001',
          sessionId: '00000000-0000-4000-8000-000000000002',
          role: UserRole.AgricultureExpert,
        },
        { type: ReportType.ExpertReview, resourceId: '00000000-0000-4000-8000-000000000003' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(queue.add).not.toHaveBeenCalled();
  });
});

import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { OBJECT_STORAGE_PROVIDER, type ObjectStorageProvider } from './object-storage.provider';
import { verifyLocalUploadToken } from './local-upload-token';

/**
 * Receives real bytes for the local-disk storage provider's presigned URLs. Authenticated by
 * the signed token in the URL itself (real presigned-URL semantics), not a bearer token —
 * exactly like the Stripe webhook route, this is @Public() on purpose.
 */
@ApiExcludeController()
@Public()
@Controller({ path: 'media', version: '1' })
export class LocalStorageController {
  constructor(
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    private readonly config: ConfigService,
  ) {}

  @Put('local-upload/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async upload(@Param('token') token: string, @Req() req: Request): Promise<void> {
    const objectKey = verifyLocalUploadToken(
      this.config.getOrThrow<string>('jwtAccessSecret'),
      token,
      'PUT',
    );
    if (!objectKey)
      throw new BadRequestException({
        code: 'UPLOAD_TOKEN_INVALID',
        message: 'This upload link is invalid or has expired.',
      });
    const contentType = req.headers['content-type'] ?? 'application/octet-stream';
    await this.storage.putPrivateObject({ objectKey, contentType, body: req.body as Buffer });
  }

  @Get('local-access/:token')
  async access(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const objectKey = verifyLocalUploadToken(
      this.config.getOrThrow<string>('jwtAccessSecret'),
      token,
      'GET',
    );
    if (!objectKey) throw new NotFoundException('This link is invalid or has expired.');
    const [body, meta] = await Promise.all([
      this.storage.getPrivateObject(objectKey),
      this.storage.inspectObject(objectKey),
    ]);
    res.setHeader('content-type', meta.contentType);
    res.setHeader('cache-control', 'private, max-age=60');
    res.send(body);
  }
}

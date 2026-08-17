import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { CompleteUploadDto, PresignUploadDto } from './dto/media.dto';
import { MediaService } from './media.service';
import type { UploadAuthorization } from './storage/object-storage.provider';

@ApiTags('Private media')
@ApiBearerAuth()
@Controller({ version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads/presign')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  presign(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() dto: PresignUploadDto,
  ): Promise<{ media: Record<string, unknown>; upload: UploadAuthorization }> {
    return this.media.presign(principal.userId, dto);
  }

  @Post('uploads/complete')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() dto: CompleteUploadDto,
  ): Promise<Record<string, unknown>> {
    return this.media.complete(principal.userId, dto);
  }

  @Get('media/:id/access-url')
  accessUrl(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ mediaId: string; url: string; expiresAt: Date }> {
    return this.media.accessUrl(principal.userId, id);
  }
}

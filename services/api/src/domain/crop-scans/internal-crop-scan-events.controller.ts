import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { InternalCropScanEventDto } from './dto/internal-crop-scan-event.dto';
import { InternalCropScanEventsService } from './internal-crop-scan-events.service';
import { InternalServiceTokenGuard } from './internal-service-token.guard';

/**
 * Receives best-effort hand-offs from services/platform-api (app/crop_scans/handoff.py). Not a user
 * route: the JWT guard is bypassed on purpose and the shared service token is the credential.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@UseGuards(InternalServiceTokenGuard)
@Controller({ version: '1', path: 'internal/crop-scan-events' })
export class InternalCropScanEventsController {
  constructor(private readonly events: InternalCropScanEventsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  handle(@Body() dto: InternalCropScanEventDto): Promise<{ accepted: true; applied: boolean }> {
    return this.events.handle(dto.event, dto.scanId);
  }
}

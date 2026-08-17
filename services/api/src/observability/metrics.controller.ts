import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../domain/auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller({ path: '', version: '1' })
@Public()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}
  @Get('metrics') get(@Req() req: Request, @Res() res: Response): void {
    if (!this.config.get<boolean>('metricsEnabled', false)) throw new NotFoundException();
    const expected = this.config.get<string>('metricsToken', '');
    if (expected && req.header('authorization') !== `Bearer ${expected}`)
      throw new UnauthorizedException();
    res.type('text/plain; version=0.0.4').send(this.metrics.render());
  }
}

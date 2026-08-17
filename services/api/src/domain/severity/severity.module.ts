import { Module } from '@nestjs/common';
import { SeverityController } from './severity.controller';
import { SeverityEngine } from './severity.engine';
import { SeverityService } from './severity.service';
@Module({ controllers: [SeverityController], providers: [SeverityService, SeverityEngine] })
export class SeverityModule {}

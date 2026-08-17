import { Module } from '@nestjs/common';
import { GeospatialService } from './geospatial.service';
@Module({ providers: [GeospatialService], exports: [GeospatialService] })
export class GeospatialModule {}

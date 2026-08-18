import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { CreatePilotLeadDto } from './dto/growth.dto';
import { AcquisitionSource, PilotLeadStatus } from './growth.enums';

@Injectable()
export class PilotLeadService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async submit(dto: CreatePilotLeadDto): Promise<{ id: string; status: PilotLeadStatus }> {
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO pilot_leads(id,name,email,phone,country,farm_size_acres,main_crop,farm_count,acquisition_source,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        dto.name,
        dto.email,
        dto.phone ?? null,
        dto.country,
        dto.farmSizeAcres ?? null,
        dto.mainCrop,
        dto.farmCount ?? null,
        dto.acquisitionSource ?? AcquisitionSource.Direct,
        PilotLeadStatus.New,
      ],
    );
    return { id, status: PilotLeadStatus.New };
  }
}

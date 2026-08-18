import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { EvidenceFreshness } from '../src/domain/digital-twin/digital-twin.enums';
import {
  describeFreshness,
  FarmDigitalTwinService,
} from '../src/domain/digital-twin/farm-digital-twin.service';

describe('FarmDigitalTwinService', () => {
  const now = new Date('2026-08-17T12:00:00.000Z');

  it('constructs a normalized snapshot with source provenance and no binary imagery', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM farms f JOIN farmer_profiles'))
        return [{ id: 'farm-1', name: 'Green Farm', areaHectares: 12, bbox: [71, 30, 72, 31] }];
      if (sql.includes('field_health_scores')) return [];
      if (sql.includes('satellite_captures') && sql.includes('FROM fields fi LEFT JOIN LATERAL'))
        return [
          {
            id: 'capture-1',
            fieldId: 'field-1',
            provider: 'SENTINEL_HUB',
            sourceIdentifier: 'S2-scene-1',
            observedAt: new Date('2026-08-16T12:00:00Z'),
            ingestedAt: new Date('2026-08-16T13:00:00Z'),
            sourceStatus: 'GOOD',
            layers: [{ type: 'NDVI', mediaAssetId: 'asset-1' }],
          },
        ];
      if (sql.includes('FROM fields fi LEFT JOIN LATERAL'))
        return [
          {
            id: 'field-1',
            farmId: 'farm-1',
            name: 'North Field',
            status: 'active',
            areaHectares: 5,
            bbox: [71, 30, 71.1, 30.1],
            cropCycleId: 'cycle-1',
            cropId: 'crop-1',
            crop: 'Cotton',
            sowingDate: '2026-07-01',
            growthStage: 'vegetative',
            cropCycleStatus: 'active',
          },
        ];
      if (sql.includes('FROM satellite_statistics')) return [];
      if (sql.includes('FROM weather_snapshots'))
        return [
          {
            id: 'weather-1',
            fieldId: 'field-1',
            provider: 'OPEN_METEO',
            sourceIdentifier: 'forecast-1',
            observedAt: new Date('2026-08-17T10:00:00Z'),
            ingestedAt: new Date('2026-08-17T10:01:00Z'),
            sourceStatus: 'RECORDED',
          },
        ];
      if (sql.includes('FROM weather_forecasts')) return [];
      if (sql.includes('FROM farm_incidents')) return [];
      if (sql.includes('FROM farm_interventions')) return [];
      if (sql.includes('FROM field_inspections')) return [];
      if (sql.includes('FROM crop_scans cs JOIN diagnoses')) return [];
      if (sql.includes('FROM farm_verifications')) return [];
      return [];
    });
    const service = new FarmDigitalTwinService({ query } as unknown as DataSource);

    const snapshot = await service.getSnapshot(
      'user-1',
      'farm-1',
      { days: 30, includeGeometry: false },
      now,
    );

    expect(snapshot.farm).toMatchObject({
      id: 'farm-1',
      geometryRef: '/api/v1/farms/farm-1/geojson',
    });
    expect(snapshot.farm).not.toHaveProperty('boundary');
    expect(snapshot.crop[0]).toMatchObject({ name: 'Cotton', growthStage: 'vegetative' });
    expect(snapshot.latestSatellite[0]).toMatchObject({ sourceIdentifier: 'S2-scene-1' });
    expect(snapshot.latestSatellite[0]).not.toHaveProperty('binary');
    expect(snapshot.dataFreshness.satellite?.status).toBe(EvidenceFreshness.Fresh);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('fp.user_id=$2'), [
      'farm-1',
      'user-1',
    ]);
  });

  it('reports missing and stale evidence deterministically', () => {
    expect(describeFreshness(undefined, 3600, now).status).toBe(EvidenceFreshness.Missing);
    expect(
      describeFreshness(
        { observedAt: '2026-08-16T00:00:00Z', ingestedAt: '2026-08-16T00:01:00Z' },
        3600,
        now,
      ).status,
    ).toBe(EvidenceFreshness.Stale);
    expect(
      describeFreshness({ observedAt: now, sourceStatus: 'ESTIMATED' }, 3600, now).status,
    ).toBe(EvidenceFreshness.Estimated);
  });

  it('returns timeline events in database chronology with evidence references', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM farms f JOIN farmer_profiles')) return [{ id: 'farm-1' }];
      if (sql.includes('FROM fields fi LEFT JOIN LATERAL')) return [{ id: 'field-1' }];
      return [
        {
          id: 'new',
          type: 'WEATHER_OBSERVATION',
          fieldId: 'field-1',
          occurredAt: new Date('2026-08-17T11:00:00Z'),
          source: 'OPEN_METEO',
          sourceIdentifier: 'weather-new',
          summary: {},
        },
        {
          id: 'old',
          type: 'FARMER_OBSERVATION',
          fieldId: 'field-1',
          occurredAt: new Date('2026-08-16T11:00:00Z'),
          source: 'FARMER',
          sourceIdentifier: 'inspection-old',
          summary: {},
        },
      ];
    });
    const service = new FarmDigitalTwinService({ query } as unknown as DataSource);
    const timeline = await service.getTimeline('user-1', 'farm-1', {
      days: 30,
      limit: 100,
      includeGeometry: false,
    });
    expect(timeline.events.map((event) => event.id)).toEqual(['new', 'old']);
    expect(timeline.events[0]?.evidence[0]).toMatchObject({
      id: 'WEATHER_OBSERVATION:new',
      sourceIdentifier: 'weather-new',
    });
  });

  it('uses an indistinguishable not-found response for invalid or inaccessible farms', async () => {
    const service = new FarmDigitalTwinService({
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource);
    await expect(
      service.getSnapshot('other-user', 'farm-1', { days: 30, includeGeometry: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

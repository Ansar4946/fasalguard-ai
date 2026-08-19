import type { DataSource } from 'typeorm';
import type { Queue } from 'bullmq';
import {
  AutomaticMonitoringService,
  type MonitoringJob,
} from '../src/domain/satellite/automatic-monitoring.service';
describe('AutomaticMonitoringService', () => {
  it('claims due fields and enqueues only a lightweight Catalog monitoring job', async () => {
    const due = {
      fieldId: '9cc7eb89-d0ea-4bc5-bff6-c768f27a5698',
      boundary: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [71, 30],
            [71.1, 30],
            [71.1, 30.1],
            [71, 30.1],
            [71, 30],
          ],
        ],
      },
      lastSuccessfulCaptureAt: null,
    };
    // DataSource.query() for an UPDATE...RETURNING returns a [rows, affectedCount] tuple.
    const query = jest.fn().mockResolvedValue([[due], 1]);
    const add = jest.fn().mockResolvedValue(undefined);
    const service = new AutomaticMonitoringService(
      { query } as unknown as DataSource,
      { add } as unknown as Queue<MonitoringJob>,
    );
    expect(await service.dispatchDueFields()).toBe(1);
    expect(add).toHaveBeenCalledWith(
      'satellite:monitor',
      { fieldId: due.fieldId, polygon: due.boundary, lastSuccessfulCaptureAt: null },
      expect.objectContaining({ attempts: 1 }),
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE SKIP LOCKED'));
  });
  it('does not enqueue when no field is due', async () => {
    const add = jest.fn();
    const service = new AutomaticMonitoringService(
      { query: jest.fn().mockResolvedValue([[], 0]) } as unknown as DataSource,
      { add } as unknown as Queue<MonitoringJob>,
    );
    expect(await service.dispatchDueFields()).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });
});

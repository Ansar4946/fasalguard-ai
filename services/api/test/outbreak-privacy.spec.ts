import type { DataSource } from 'typeorm';
import { OutbreakService } from '../src/domain/outbreaks/outbreak.service';
describe('Outbreak public projection', () => {
  it('selects only sanitized cluster geometry for the map', async () => {
    let sql = '';
    const db = {
      query: jest.fn((query: string) => {
        sql = query;
        return Promise.resolve([]);
      }),
    } as unknown as DataSource;
    await new OutbreakService(db, {} as never).map();
    expect(sql).toContain('ST_AsGeoJSON(oc.public_area)');
    expect(sql).not.toContain('private_centroid');
    expect(sql).not.toContain('reporter_id');
    expect(sql).not.toContain('private_location');
  });
});

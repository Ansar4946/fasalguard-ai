import { ReportProcessor } from '../src/domain/reports/report.processor';
import { ReportStatus, ReportType } from '../src/domain/reports/report.enums';
describe('ReportProcessor', () => {
  const row = {
    id: '00000000-0000-4000-8000-000000000001',
    owner_id: '00000000-0000-4000-8000-000000000002',
    type: ReportType.FieldHealth,
    status: ReportStatus.Queued,
    resource_id: null,
    parameters: {},
    object_key: null,
    content_type: null,
    size_bytes: null,
    failure_code: null,
    deduplication_key: 'test-key',
    request_hash: 'a'.repeat(64),
    created_at: new Date(),
    completed_at: null,
  };
  it('renders and completes an idempotent queued report', async () => {
    const reports = {
      loadForWorker: jest.fn().mockResolvedValue(row),
      markGenerating: jest.fn(),
      lines: jest.fn().mockResolvedValue(['safe aggregate']),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    const worker = new ReportProcessor(reports as never);
    await worker.process({ data: { reportId: row.id, ownerId: row.owner_id } } as never);
    expect(reports.markGenerating).toHaveBeenCalledWith(row.id);
    expect(reports.complete).toHaveBeenCalledWith(row, expect.any(Buffer));
    expect(reports.fail).not.toHaveBeenCalled();
  });
  it('does not regenerate a completed report', async () => {
    const reports = {
      loadForWorker: jest.fn().mockResolvedValue({ ...row, status: ReportStatus.Completed }),
      markGenerating: jest.fn(),
      lines: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    await new ReportProcessor(reports as never).process({
      data: { reportId: row.id, ownerId: row.owner_id },
    } as never);
    expect(reports.complete).not.toHaveBeenCalled();
  });
});

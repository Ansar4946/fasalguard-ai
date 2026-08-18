import { PilotLeadService } from '../src/domain/growth/pilot-lead.service';

describe('PilotLeadService', () => {
  it('submits a lead with a NEW status and persists the real submitted fields', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const result = await new PilotLeadService({ query } as never).submit({
      name: 'Ahmad Khan',
      email: 'ahmad@example.com',
      country: 'Pakistan',
      mainCrop: 'Cotton',
    });
    expect(result.status).toBe('NEW');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pilot_leads'),
      expect.arrayContaining(['Ahmad Khan', 'ahmad@example.com', null, 'Pakistan']),
    );
  });
});

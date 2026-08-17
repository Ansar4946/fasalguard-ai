import { renderPdf } from '../src/domain/reports/pdf.renderer';
describe('report PDF renderer', () => {
  it('creates a valid PDF and escapes document text', () => {
    const pdf = renderPdf('Health (weekly)', [
      'Leaf \\ inspection',
      'Farmer name is intentionally absent',
    ]);
    const text = pdf.toString('latin1');
    expect(text).toMatch(/^%PDF-1\.4/);
    expect(text).toContain('Health \\(weekly\\)');
    expect(text).toContain('xref');
    expect(text).toContain('trailer');
    expect(text).toMatch(/%%EOF$/);
  });
});

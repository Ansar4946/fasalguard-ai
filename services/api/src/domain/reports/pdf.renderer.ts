const escape = (x: string): string =>
  x
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e]/g, '?');
export function renderPdf(title: string, lines: string[]): Buffer {
  const content = [
    'BT',
    '/F1 18 Tf',
    '50 790 Td',
    `(${escape(title)}) Tj`,
    '/F1 10 Tf',
    ...lines.slice(0, 45).flatMap((line) => ['0 -16 Td', `(${escape(line.slice(0, 110))}) Tj`]),
    'ET',
  ].join('\n');
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => String(x).padStart(10, '0') + ' 00000 n ')
    .join(
      '\n',
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

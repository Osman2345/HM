import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

type ReportSection = {
  title: string;
  headers: readonly unknown[];
  rows: readonly (readonly unknown[])[];
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function withdrawalStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'paid':
      return 'Paid';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

export function downloadCsv(filename: string, rows: readonly (readonly unknown[])[]) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;

  const content = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

export async function createPdfAndShare(
  title: string,
  subtitle: string,
  metrics: readonly (readonly [string, string | number])[],
  sections: readonly ReportSection[],
) {
  const metricHtml = metrics
    .map(([label, value]) => `<div class="metric"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join('');
  const sectionsHtml = sections
    .map(({ title: sectionTitle, headers, rows }) => {
      const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
      const rowsHtml = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('');
      return `<section><h2>${escapeHtml(sectionTitle)}</h2><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></section>`;
    })
    .join('');
  const html = `<!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; padding: 24px; }
          h1 { margin-bottom: 4px; }
          .subtitle { color: #64748b; margin-top: 0; }
          .metrics { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; }
          .metric { display: flex; flex-direction: column; gap: 6px; min-width: 140px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
          section { margin-top: 24px; }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; overflow-wrap: anywhere; }
          th { background: #f1f5f9; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
        <div class="metrics">${metricHtml}</div>
        ${sectionsHtml}
      </body>
    </html>`;

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf' });
}

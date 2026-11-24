import { describe, it, expect, vi, afterEach } from 'vitest';
import { csvCell, csvFileName, downloadCsv, toCsv } from './csv';

describe('csv', () => {
  it('leaves ordinary text and numbers alone', () => {
    expect(csvCell('Acme ERP')).toBe('Acme ERP');
    expect(csvCell(1200.5)).toBe('1200.5');
    expect(csvCell(0)).toBe('0');
  });

  it('writes nothing for missing or non-finite values', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(Infinity)).toBe('');
  });

  it('quotes cells with commas, quotes and line breaks', () => {
    expect(csvCell('Smith, John')).toBe('"Smith, John"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('stops text from being run as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe('"\'=HYPERLINK(""http://evil"",""click"")"');
    for (const bad of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1']) {
      expect(csvCell(bad).replace(/^"/, '')).toMatch(/^'/);
    }
  });

  it('does not touch a real negative number', () => {
    expect(csvCell(-250)).toBe('-250');
  });

  it('builds rows with Windows line endings and a closing line break', () => {
    expect(toCsv([['Month', 'Value'], ['2026-11', 1000]])).toBe('Month,Value\r\n2026-11,1000\r\n');
  });

  it('makes a safe file name with the date', () => {
    expect(csvFileName('Deals over time', new Date(2026, 10, 8))).toBe('deals-over-time-2026-11-08.csv');
    expect(csvFileName('../../etc/passwd', new Date(2026, 0, 2))).toBe('etc-passwd-2026-01-02.csv');
    expect(csvFileName('!!!', new Date(2026, 0, 2))).toBe('export-2026-01-02.csv');
  });

  describe('downloadCsv', () => {
    afterEach(() => vi.restoreAllMocks());

    it('saves a file with a byte-order mark and cleans up after itself', async () => {
      const create = vi.fn(() => 'blob:fake');
      const revoke = vi.fn();
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
      let clicked: HTMLAnchorElement | null = null;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked = this;
      });

      downloadCsv('report.csv', [['a', 'b']]);

      const blob = (create.mock.calls[0] as unknown as [Blob])[0];
      expect(blob.type).toContain('text/csv');
      // Read the raw bytes: decoding as text would quietly drop the byte-order mark.
      const bytes = await new Promise<Uint8Array>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.readAsArrayBuffer(blob);
      });
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 byte-order mark, for Excel
      expect(new TextDecoder().decode(bytes.slice(3))).toBe('a,b\r\n');
      expect(clicked!.download).toBe('report.csv');
      expect(revoke).toHaveBeenCalledWith('blob:fake');
      expect(document.querySelector('a[download]')).toBeNull();
    });
  });
});

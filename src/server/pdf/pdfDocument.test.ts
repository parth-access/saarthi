import { describe, it, expect } from 'vitest';
import { buildPdf, hexColor, sanitizeForPdf, PdfPage, PAGE_WIDTH, PAGE_HEIGHT } from './pdfDocument';
import { measureText } from './fontMetrics';

/**
 * These tests exist to prove the output is a *real* PDF.
 *
 * The requirement was a file a client can keep and hand to an accountant — not an
 * HTML page named `.pdf`, not a `window.print()` dialog. So the assertions here
 * are structural: the header, the object graph, a cross reference table whose
 * offsets actually point at their objects, a trailer, `%%EOF`, and stream lengths
 * that match the bytes written. A viewer rejects the file if any of those lie, and
 * a broken receipt would only ever be discovered by a user.
 */

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

function samplePage(): PdfPage {
  const page = new PdfPage();
  page.rect(0, PAGE_HEIGHT - 6, PAGE_WIDTH, 6, hexColor('#E6A520'));
  page.text('Saarthi', 56, 700, { font: 'serif', size: 26 });
  page.text('INR 1,500.00', PAGE_WIDTH - 56, 600, { align: 'right', font: 'bold' });
  page.line(56, 590, PAGE_WIDTH - 56, hexColor('#D8DEDA'));
  return page;
}

const META = {
  title: 'Saarthi payment receipt SAAR-2026-ABCD1234',
  author: 'Saarthi',
  subject: 'Therapy session on 2026-09-10',
  createdAt: new Date('2026-09-02T04:45:00.000Z'),
};

describe('buildPdf structure', () => {
  const bytes = buildPdf([samplePage()], META);
  const text = latin1(bytes);

  it('opens with a PDF header and a binary marker, and ends at %%EOF', () => {
    expect(text.startsWith('%PDF-1.7\n')).toBe(true);
    // The four high bytes on line two are what makes tools treat the file as
    // binary rather than text, which is required for a conforming PDF.
    expect(text.slice(9, 15)).toBe('%\xE2\xE3\xCF\xD3\n');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('declares the object graph a viewer needs to find a page', () => {
    expect(text).toContain('<< /Type /Catalog /Pages 2 0 R >>');
    expect(text).toContain('/Type /Pages /Kids [3 0 R] /Count 1');
    expect(text).toContain('/Type /Page /Parent 2 0 R');
    expect(text).toContain(`/MediaBox [0 0 595.28 841.89]`);
    // Base-14 faces, so nothing is embedded and no licensing question arises.
    expect(text).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding');
    expect(text).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    expect(text).toContain('/BaseFont /Times-Bold /Encoding /WinAnsiEncoding');
  });

  it('points startxref at the real cross reference table', () => {
    const m = /startxref\n(\d+)\n%%EOF\n$/.exec(text);
    expect(m).not.toBeNull();
    const offset = Number(m![1]);
    expect(text.slice(offset, offset + 4)).toBe('xref');
  });

  it('gives every xref entry the byte offset of its own object', () => {
    // This is the assertion that would catch an off-by-one in the single-pass
    // offset accounting — the failure mode that produces a file which opens in
    // one viewer and is "damaged" in another.
    const offset = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    const header = /^xref\n0 (\d+)\n/.exec(text.slice(offset))!;
    const size = Number(header[1]);
    const rows = text.slice(offset + header[0].length).split('\n');
    // Entry 0 is the mandatory free-list head, not an object.
    expect(rows[0]).toBe('0000000000 65535 f ');
    const lines = rows.slice(1, size);
    expect(lines).toHaveLength(size - 1);
    lines.forEach((line, i) => {
      expect(line).toMatch(/^\d{10} 00000 n $/);
      const objOffset = Number(line.slice(0, 10));
      expect(text.startsWith(`${i + 1} 0 obj`, objOffset)).toBe(true);
    });
    expect(text).toContain(`trailer\n<< /Size ${size} /Root 1 0 R /Info ${size - 1} 0 R >>`);
  });

  it('declares each content stream with its exact byte length', () => {
    const re = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g;
    let match: RegExpExecArray | null;
    let streams = 0;
    while ((match = re.exec(text)) !== null) {
      streams += 1;
      expect(Buffer.byteLength(match[2], 'latin1')).toBe(Number(match[1]));
    }
    expect(streams).toBe(1);
  });

  it('stamps the document metadata in IST', () => {
    expect(text).toContain('/Title (Saarthi payment receipt SAAR-2026-ABCD1234)');
    expect(text).toContain('/Producer (Saarthi)');
    // 04:45 UTC is 10:15 IST on the same day.
    expect(text).toContain("/CreationDate (D:20260902101500+05'30')");
  });

  it('renders multiple pages with independent content streams', () => {
    const two = latin1(buildPdf([samplePage(), samplePage()], META));
    expect(two).toContain('/Kids [3 0 R 4 0 R] /Count 2');
    expect(two.match(/\/Type \/Page /g)).toHaveLength(2);
  });

  it('refuses to build a document with no pages', () => {
    expect(() => buildPdf([], META)).toThrow(/at least one page/i);
  });
});

describe('sanitizeForPdf', () => {
  it('transliterates typographic punctuation the base-14 encoding lacks', () => {
    expect(sanitizeForPdf('Saarthi — therapy ‘sessions’')).toBe(
      "Saarthi - therapy 'sessions'"
    );
    expect(sanitizeForPdf('₹1,500')).toBe('INR1,500');
    expect(sanitizeForPdf('wait…')).toBe('wait...');
  });

  it('drops unrepresentable characters instead of printing question marks', () => {
    // A row of `?` reads as corruption of a real value, so callers fall back to
    // something they know is ASCII (the renderer uses the email address).
    expect(sanitizeForPdf('अनन्या')).toBe('');
    expect(sanitizeForPdf('Ananya अनन्या')).toBe('Ananya');
    expect(sanitizeForPdf('emoji 🎉 here')).toBe('emoji here');
  });

  it('keeps Latin-1 accents, which the WinAnsi fonts can draw', () => {
    expect(sanitizeForPdf('José Menéndez')).toBe('José Menéndez');
  });

  it('flattens newlines and tabs so text cannot escape its line', () => {
    expect(sanitizeForPdf('line one\nline two\ttabbed')).toBe('line one line two tabbed');
    expect(sanitizeForPdf('  padded   out  ')).toBe('padded out');
  });

  it('handles nullish input without throwing', () => {
    expect(sanitizeForPdf(undefined as unknown as string)).toBe('');
    expect(sanitizeForPdf(null as unknown as string)).toBe('');
  });
});

describe('PdfPage drawing', () => {
  it('escapes characters that would end a PDF string object early', () => {
    // An unescaped ")" in a client's name would truncate the content stream and
    // corrupt every operator after it.
    const page = new PdfPage();
    page.text('Ananya (Anu) \\ Sharma', 56, 700);
    expect(page.toContentStream()).toContain('(Ananya \\(Anu\\) \\\\ Sharma) Tj');
  });

  it('skips text that sanitises away to nothing', () => {
    const page = new PdfPage();
    page.text('अनन्या', 56, 700);
    expect(page.toContentStream()).toBe('');
    expect(page.usedFonts.size).toBe(0);
  });

  it('right-aligns by measuring the string, not by guessing', () => {
    const page = new PdfPage();
    const value = 'INR 1,50,000.00';
    page.text(value, 500, 600, { align: 'right', font: 'bold', size: 13 });
    const x = Number(/1 0 0 1 ([\d.]+) 600 Tm/.exec(page.toContentStream())![1]);
    expect(500 - x).toBeCloseTo(measureText(value, 'bold', 13), 2);
  });

  it('records only the fonts actually drawn', () => {
    const page = new PdfPage();
    page.text('regular', 10, 10);
    page.text('bold', 10, 20, { font: 'bold' });
    expect([...page.usedFonts].sort()).toEqual(['bold', 'regular']);
  });
});

describe('hexColor', () => {
  it('normalises to DeviceRGB components', () => {
    expect(hexColor('#FFFFFF')).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexColor('000000')).toEqual({ r: 0, g: 0, b: 0 });
    const primary = hexColor('#1F5E3B');
    expect(primary.r).toBeCloseTo(31 / 255, 5);
    expect(primary.g).toBeCloseTo(94 / 255, 5);
    expect(primary.b).toBeCloseTo(59 / 255, 5);
  });

  it('falls back to black rather than emitting an invalid operator', () => {
    expect(hexColor('not-a-color')).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('measureText', () => {
  it('uses the standard Adobe advance widths', () => {
    expect(measureText(' ', 'regular', 10)).toBeCloseTo(2.78, 5);
    expect(measureText('M', 'regular', 10)).toBeCloseTo(8.33, 5);
    expect(measureText('i', 'regular', 10)).toBeCloseTo(2.22, 5);
    expect(measureText('', 'regular', 10)).toBe(0);
  });

  it('scales linearly with point size', () => {
    expect(measureText('Total paid', 'bold', 20)).toBeCloseTo(
      measureText('Total paid', 'bold', 10) * 2,
      5
    );
  });

  it('measures the serif wordmark with the bold table by design', () => {
    expect(measureText('Saarthi', 'serif', 26)).toBe(measureText('Saarthi', 'bold', 26));
  });

  it('falls back to a digit width outside the tabulated range', () => {
    expect(measureText('é', 'regular', 10)).toBeCloseTo(5.56, 5);
  });
});

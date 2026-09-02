/**
 * A minimal, dependency-free writer for real PDF files.
 *
 * This exists because a receipt has to be an actual PDF — a file a client can
 * keep, mail to an insurer, or hand to an accountant — not an HTML page with a
 * `.pdf` name and not `window.print()`. It emits a conforming PDF 1.7 document:
 * catalog, page tree, content streams, base-14 font resources, a real cross
 * reference table and trailer.
 *
 * Scope is deliberately small: positioned text, rules and filled rectangles in
 * DeviceRGB, which is everything a receipt layout needs. No images, no font
 * embedding (base-14 faces are always available), no compression — an uncompressed
 * receipt is a few kilobytes and stays greppable, which makes the output testable.
 */
import { BASE_FONT_NAME, measureText, type PdfFont } from './fontMetrics';

/** A4 in PostScript points, the page size Indian users expect from a receipt. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#RRGGBB` -> normalised DeviceRGB components. */
export function hexColor(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

const WIN_ANSI_SPECIALS: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'", '‚': "'",
  '“': '"', '”': '"', '„': '"', '…': '...', '•': '*',
  ' ': ' ', '₹': 'INR', '−': '-',
};

/**
 * Makes a string safe to draw with a WinAnsi-encoded base-14 font.
 *
 * Typographic punctuation is transliterated to its ASCII equivalent; anything
 * still outside Latin-1 (e.g. a name in Devanagari) is dropped rather than
 * replaced with `?`, because a row of question marks reads as corruption of a
 * real value. Callers decide what to show when the result comes back empty —
 * `renderReceiptPdf` falls back to the email address — so the document never
 * displays a mangled version of somebody's name.
 */
export function sanitizeForPdf(input: string): string {
  let out = '';
  for (const ch of String(input ?? '')) {
    const mapped = WIN_ANSI_SPECIALS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      out += ' ';
    } else if (code >= 0x20 && code <= 0xff) {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Escapes a sanitised string for a PDF literal string object. */
function pdfString(text: string): string {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

export interface TextOptions {
  font?: PdfFont;
  size?: number;
  color?: Rgb;
  /** `x` is the right edge instead of the left; needs the font metrics tables. */
  align?: 'left' | 'right';
  /** Extra spacing between characters, in points (used for small-caps labels). */
  charSpacing?: number;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * One page's content stream, built through drawing calls.
 *
 * Coordinates are the caller's choice of PDF user space: origin bottom-left, y
 * increasing upward. `renderReceiptPdf` works top-down and converts, which keeps
 * this class free of layout policy.
 */
export class PdfPage {
  private readonly ops: string[] = [];
  /** Fonts actually drawn on this page, so unused resources aren't declared. */
  readonly usedFonts = new Set<PdfFont>();

  text(value: string, x: number, y: number, options: TextOptions = {}): this {
    const clean = sanitizeForPdf(value);
    if (!clean) return this;
    const font = options.font ?? 'regular';
    const size = options.size ?? 10;
    const color = options.color ?? BLACK;
    const spacing = options.charSpacing ?? 0;
    this.usedFonts.add(font);

    let drawX = x;
    if (options.align === 'right') {
      const width = measureText(clean, font, size) + spacing * Math.max(0, clean.length - 1);
      drawX = x - width;
    }

    this.ops.push(
      `BT`,
      `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg`,
      `/${fontResourceName(font)} ${fmt(size)} Tf`,
      `${fmt(spacing)} Tc`,
      `1 0 0 1 ${fmt(drawX)} ${fmt(y)} Tm`,
      `(${pdfString(clean)}) Tj`,
      `0 Tc`,
      `ET`
    );
    return this;
  }

  /** Filled rectangle; `y` is the bottom edge. */
  rect(x: number, y: number, width: number, height: number, color: Rgb): this {
    this.ops.push(
      `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg`,
      `${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re`,
      `f`
    );
    return this;
  }

  /** Horizontal rule — the only stroke the receipt needs. */
  line(x1: number, y: number, x2: number, color: Rgb, thickness = 0.6): this {
    this.ops.push(
      `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} RG`,
      `${fmt(thickness)} w`,
      `${fmt(x1)} ${fmt(y)} m ${fmt(x2)} ${fmt(y)} l`,
      `S`
    );
    return this;
  }

  /** Measures with the same metrics used for right alignment. */
  widthOf(value: string, font: PdfFont = 'regular', size = 10): number {
    return measureText(sanitizeForPdf(value), font, size);
  }

  toContentStream(): string {
    return this.ops.join('\n');
  }
}

function fontResourceName(font: PdfFont): string {
  return font === 'regular' ? 'F1' : font === 'bold' ? 'F2' : 'F3';
}

/** Fixed-precision, trailing zeros trimmed — keeps the stream small and stable. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  /** Fixed by the caller so the same receipt always renders byte-identically. */
  createdAt: Date;
}

/**
 * Assembles pages into a PDF byte string.
 *
 * Object numbering is fixed rather than dynamic — catalog, page tree, then one
 * content stream plus one page object per page, then the three fonts, then the
 * info dictionary — so the xref offsets can be computed in a single pass.
 */
export function buildPdf(pages: PdfPage[], metadata: PdfMetadata): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page.');

  const objects: string[] = [];
  const pageCount = pages.length;
  const firstPageObj = 3;
  const firstContentObj = firstPageObj + pageCount;
  const fontObj = firstContentObj + pageCount;
  const infoObj = fontObj + 3;

  // 1: catalog, 2: page tree
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  const kids = pages.map((_, i) => `${firstPageObj + i} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);

  // One page object per page. All three fonts are declared on every page: a
  // viewer ignores unused resources, and this keeps object numbering fixed.
  const fontResources =
    `<< /F1 ${fontObj} 0 R /F2 ${fontObj + 1} 0 R /F3 ${fontObj + 2} 0 R >>`;
  pages.forEach((_, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${fmt(PAGE_WIDTH)} ${fmt(PAGE_HEIGHT)}] ` +
        `/Resources << /Font ${fontResources} >> ` +
        `/Contents ${firstContentObj + i} 0 R >>`
    );
  });

  // Content streams. Length is the byte length in latin1, which is what the
  // file is written in, so a multi-byte accent can't desynchronise the stream.
  for (const page of pages) {
    const stream = page.toContentStream();
    const length = Buffer.byteLength(stream, 'latin1');
    objects.push(`<< /Length ${length} >>\nstream\n${stream}\nendstream`);
  }

  for (const font of ['regular', 'bold', 'serif'] as PdfFont[]) {
    objects.push(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONT_NAME[font]} /Encoding /WinAnsiEncoding >>`
    );
  }

  objects.push(
    `<< /Title (${pdfString(sanitizeForPdf(metadata.title))}) ` +
      `/Author (${pdfString(sanitizeForPdf(metadata.author))}) ` +
      `/Subject (${pdfString(sanitizeForPdf(metadata.subject))}) ` +
      `/Producer (Saarthi) /Creator (Saarthi) ` +
      `/CreationDate (${pdfDate(metadata.createdAt)}) >>`
  );

  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (text: string) => {
    const buf = Buffer.from(text, 'latin1');
    chunks.push(buf);
    offset += buf.length;
  };

  push(`%PDF-1.7\n%\xE2\xE3\xCF\xD3\n`);

  const xref: number[] = [];
  objects.forEach((body, i) => {
    xref.push(offset);
    push(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });

  const startXref = offset;
  const size = objects.length + 1;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const entry of xref) {
    table += `${String(entry).padStart(10, '0')} 00000 n \n`;
  }
  push(table);
  push(
    `trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoObj} 0 R >>\n` +
      `startxref\n${startXref}\n%%EOF\n`
  );

  return new Uint8Array(Buffer.concat(chunks));
}

/** PDF date syntax: `D:YYYYMMDDHHmmSS+05'30'`. Receipts are stamped in IST. */
function pdfDate(date: Date): string {
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `D:${ist.getUTCFullYear()}${p(ist.getUTCMonth() + 1)}${p(ist.getUTCDate())}` +
    `${p(ist.getUTCHours())}${p(ist.getUTCMinutes())}${p(ist.getUTCSeconds())}+05'30'`
  );
}

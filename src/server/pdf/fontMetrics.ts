/**
 * Advance widths for the PDF base-14 fonts we use.
 *
 * The receipt PDF is written directly (see `pdfDocument.ts`) rather than through
 * a rendering library, so nothing else knows how wide a string is. Right-aligned
 * numbers — the amount column, the total — need that answer, hence these tables.
 *
 * Values are the standard Adobe AFM widths in 1/1000 em for code points 32..126,
 * which is the exact range the receipt renders (everything outside it is
 * transliterated or dropped by `sanitizeForPdf`). Base-14 fonts are guaranteed to
 * be present in every conforming PDF viewer, so no font is embedded and no
 * licensing or file-size question arises.
 */

const FIRST_CHAR = 32;
const LAST_CHAR = 126;

/** Fallback for anything outside the tabulated range; the Helvetica digit width. */
const DEFAULT_WIDTH = 556;

const HELVETICA: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556,
  556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

const HELVETICA_BOLD: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611,
  611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

/** The base-14 faces the receipt uses. `serif` is only ever the wordmark. */
export type PdfFont = 'regular' | 'bold' | 'serif';

export const BASE_FONT_NAME: Record<PdfFont, string> = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  serif: 'Times-Bold',
};

/**
 * Width of `text` in points at `size`.
 *
 * `serif` deliberately measures with the bold sans table: Times-Bold is used for
 * the left-aligned wordmark only, so its exact advance never affects layout, and
 * carrying a third table for one string would be dead weight.
 */
export function measureText(text: string, font: PdfFont, size: number): number {
  const table = font === 'regular' ? HELVETICA : HELVETICA_BOLD;
  let mille = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    mille += code >= FIRST_CHAR && code <= LAST_CHAR ? table[code - FIRST_CHAR] : DEFAULT_WIDTH;
  }
  return (mille * size) / 1000;
}

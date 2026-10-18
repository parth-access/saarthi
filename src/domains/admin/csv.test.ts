import { describe, it, expect } from 'vitest';
import { csvCell, toCsv, istDateTime } from './csv';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralises spreadsheet formulas in text', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98765')).toBe("'+91 98765");
    expect(csvCell(-5)).toBe('-5'); // real numbers stay numbers
  });

  it('writes a BOM, header and CRLF rows', () => {
    expect(toCsv(['a', 'b'], [[1, null]])).toBe('﻿a,b\r\n1,\r\n');
  });

  it('formats timestamps in IST', () => {
    expect(istDateTime('2026-10-18T08:00:00Z')).toBe('2026-10-18 13:30');
    expect(istDateTime({ toMillis: () => Date.parse('2026-10-18T18:45:00Z') })).toBe('2026-10-19 00:15');
    expect(istDateTime(undefined)).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { formatExperience } from './therapists';

describe('formatExperience', () => {
  it('adds a unit to a bare number from Firestore', () => {
    expect(formatExperience('1')).toBe('1 year experience');
    expect(formatExperience(3)).toBe('3 years experience');
    expect(formatExperience('2+')).toBe('2+ years experience');
  });
  it('keeps a phrase that already has its unit', () => {
    expect(formatExperience('1+ Years')).toBe('1+ years experience');
  });
  it('falls back when nothing is stored', () => {
    expect(formatExperience(undefined)).toBe('1+ years experience');
    expect(formatExperience('  ')).toBe('1+ years experience');
  });
});

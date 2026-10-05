import { describe, it, expect } from 'vitest';
import {
  generateTimeSlots,
  getIstNow,
  istDatePlusDays,
  isSlotBeyondBookingWindow,
  isSlotInPast,
  minutesToTime,
  slotStartEpochMs,
  slotTemporalReason,
  timeToMinutes,
} from './slots';
import { BOOKING_WINDOW_DAYS } from '@/shared/constants';

/** 2026-09-01 19:15 IST === 2026-09-01T13:45:00Z */
const SEP_1_1915_IST = new Date('2026-09-01T13:45:00.000Z');

describe('generateTimeSlots (canonical cadence)', () => {
  it('steps by duration + cooldown and only emits sessions that fit', () => {
    // Step is 45; 10:30 + 45 = 11:15 runs past the 11:00 close, so 10:30 is not
    // emitted. A start time is only offered when the WHOLE session fits.
    expect(generateTimeSlots('09:00', '11:00', 45, 0)).toEqual(['09:00', '09:45']);
    // Step is 60 + 15 = 75, so starts land on 09:00, 10:15, 11:30; 11:30 + 60 =
    // 12:30 exceeds the 12:00 close.
    expect(generateTimeSlots('09:00', '12:00', 60, 15)).toEqual(['09:00', '10:15']);
    // The cooldown is a gap between sessions, not part of the session: 10:15 + 60
    // = 11:15 fits inside an 11:15 close even though 10:15 + 60 + 15 does not.
    expect(generateTimeSlots('09:00', '11:15', 60, 15)).toEqual(['09:00', '10:15']);
  });

  it('produces the 45-minute cadence that matches the 45-minute session length', () => {
    // slotDuration 45 / cooldownGap 0 gives starts every 45 minutes, and the
    // session occupies exactly its slot (09:00-09:45, 09:45-10:30, ...), so the
    // cadence and SESSION_DURATION_MINUTES (45) agree and nothing overlaps.
    expect(generateTimeSlots('09:00', '17:00', 45, 0)).toContain('09:00');
    expect(generateTimeSlots('09:00', '17:00', 45, 0)).toContain('09:45');
    expect(generateTimeSlots('09:00', '17:00', 45, 0)).toEqual([
      '09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15',
      '15:00', '15:45',
    ]);
  });

  it('jumps past a break instead of emitting an overlapping start', () => {
    const slots = generateTimeSlots('09:00', '17:00', 45, 0, [{ startTime: '11:30', endTime: '13:00' }]);
    expect(slots).toEqual(['09:00', '09:45', '10:30', '13:00', '13:45', '14:30', '15:15', '16:00']);
    expect(slots).not.toContain('11:15'); // 11:15-12:00 overlaps the break
  });

  it('is total on bad input rather than looping forever', () => {
    expect(generateTimeSlots('09:00', '17:00', 0, 0)).toEqual([]);
    expect(generateTimeSlots('09:00', '17:00', -30, 0)).toEqual([]);
    expect(generateTimeSlots('nonsense', '17:00', 45, 0)).toEqual([]);
    expect(generateTimeSlots('17:00', '09:00', 45, 0)).toEqual([]);
    // An unparseable break must not swallow the day.
    expect(
      generateTimeSlots('09:00', '10:30', 45, 0, [{ startTime: 'x', endTime: 'y' }])
    ).toEqual(['09:00', '09:45']);
  });

  it('round-trips time <-> minutes', () => {
    expect(timeToMinutes('09:45')).toBe(585);
    expect(minutesToTime(585)).toBe('09:45');
    expect(minutesToTime(timeToMinutes('00:05'))).toBe('00:05');
  });
});

describe('IST anchoring', () => {
  it('reads the IST calendar day and wall clock, not the host timezone', () => {
    expect(getIstNow(SEP_1_1915_IST)).toMatchObject({ date: '2026-09-01', time: '19:15' });
  });

  it('resolves the IST day even when UTC is still on the previous date', () => {
    // 2026-09-01T20:00Z is already 2026-09-02 01:30 IST.
    expect(getIstNow(new Date('2026-09-01T20:00:00.000Z')).date).toBe('2026-09-02');
  });

  it('advances IST calendar days across month boundaries', () => {
    expect(istDatePlusDays(0, SEP_1_1915_IST)).toBe('2026-09-01');
    expect(istDatePlusDays(1, SEP_1_1915_IST)).toBe('2026-09-02');
    expect(istDatePlusDays(BOOKING_WINDOW_DAYS, SEP_1_1915_IST)).toBe('2026-09-15');
    expect(istDatePlusDays(30, SEP_1_1915_IST)).toBe('2026-10-01');
  });

  it('converts a slot to the same instant the booking commands use', () => {
    expect(slotStartEpochMs('2026-09-02', '09:00')).toBe(new Date('2026-09-02T03:30:00.000Z').getTime());
    expect(slotStartEpochMs('not-a-date', '09:00')).toBeNull();
  });
});

describe('temporal offerability (the missing-09:00 rule)', () => {
  const nowMs = SEP_1_1915_IST.getTime();

  it('offers every slot on a future IST day, including the first of the day', () => {
    // The reported bug: at 1 Sep 19:15 IST, 09:00 on 2 Sep is in the FUTURE and
    // must be offered. Nothing temporal may drop it.
    for (const time of ['09:00', '09:45', '10:30', '13:00', '16:00']) {
      expect(slotTemporalReason('2026-09-02', time, nowMs)).toBeNull();
    }
  });

  it('excludes same-day slots that have already started, and keeps later ones', () => {
    expect(isSlotInPast('2026-09-01', '09:00', nowMs)).toBe(true);
    expect(isSlotInPast('2026-09-01', '19:00', nowMs)).toBe(true);
    expect(isSlotInPast('2026-09-01', '19:45', nowMs)).toBe(false);
  });

  it('treats the current minute as started (matching the server, to the millisecond)', () => {
    // 19:15:00 IST exactly — the slot has not started yet at :00.000.
    expect(isSlotInPast('2026-09-01', '19:15', nowMs)).toBe(false);
    // One millisecond later it has.
    expect(isSlotInPast('2026-09-01', '19:15', nowMs + 1)).toBe(true);
  });

  it('excludes whole earlier IST days', () => {
    expect(isSlotInPast('2026-08-31', '23:45', nowMs)).toBe(true);
  });

  it('treats an unparseable slot as not offerable', () => {
    expect(isSlotInPast('2026-13-45', '09:00', nowMs)).toBe(true);
    expect(slotTemporalReason('', '', nowMs)).toBe('past');
  });

  it('applies the booking window as a rolling instant, not a calendar day', () => {
    // 14 days after 1 Sep 19:15 IST is 15 Sep 19:15 IST. An early slot on the
    // 15th is inside the window; a late one is outside it — which is why a UI
    // that offers whole days must still filter per slot.
    expect(isSlotBeyondBookingWindow('2026-09-15', '09:00', nowMs)).toBe(false);
    expect(isSlotBeyondBookingWindow('2026-09-15', '19:00', nowMs)).toBe(false);
    expect(isSlotBeyondBookingWindow('2026-09-15', '19:30', nowMs)).toBe(true);
    expect(slotTemporalReason('2026-09-16', '09:00', nowMs)).toBe('beyond_window');
  });
});

import { describe, it, expect } from 'vitest';
import { bookingSchema, rescheduleBookingSchema, lockSlotSchema } from './bookingValidators';
import { bookingFormSchema } from '@/core/validations/booking.schema';
import { AGE_RANGE_MESSAGE } from '@/shared/validation/age';
import { MAX_CLIENT_AGE, MIN_CLIENT_AGE } from '@/shared/constants';

const valid = {
  therapistId: 'th_1',
  name: 'Jane Doe',
  phone: '9999999999',
  email: 'jane@example.com',
  date: '2026-09-02',
  time: '09:00',
};

describe('bookingSchema', () => {
  it('accepts the payload the wizard actually sends', () => {
    expect(bookingSchema.safeParse({ ...valid, sessionMode: 'online', age: 18, lockId: 'l1' }).success).toBe(true);
  });

  it('stays .strict(): an unknown key is a hard failure, not a silent drop', () => {
    // This is the contract that caused the POST /api/bookings/create 400 when the
    // client sent `consent`. The strictness is intentional; the client strips it.
    const res = bookingSchema.safeParse({ ...valid, consent: true });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toContain('unrecognized_keys');
  });

  it('requires a YYYY-MM-DD date', () => {
    for (const date of ['2026-9-2', '02-09-2026', '2026/09/02', 'tomorrow', '']) {
      expect(bookingSchema.safeParse({ ...valid, date }).success).toBe(false);
    }
    // Shape-valid but impossible; rejected later by istToUtcIsoString, which is
    // why the command must not rely on the schema alone.
    expect(bookingSchema.safeParse({ ...valid, date: '2026-02-30' }).success).toBe(true);
  });

  it('requires a zero-padded 24-hour HH:MM time', () => {
    // '9:00' and '09:00' would pin two different locked_slots docs for the same
    // instant, so the unpadded form is refused rather than normalised.
    for (const time of ['9:00', '09:0', '24:00', '23:60', '9am', '09:00:00', '']) {
      expect(bookingSchema.safeParse({ ...valid, time }).success).toBe(false);
    }
    for (const time of ['00:00', '09:00', '19:45', '23:59']) {
      expect(bookingSchema.safeParse({ ...valid, time }).success).toBe(true);
    }
  });
});

describe('bookingSchema.age — the "MALE, 1Y" contract', () => {
  const parseAge = (age: unknown) => bookingSchema.safeParse({ ...valid, age });

  it('accepts a valid age as a number or a string and normalises it to a number', () => {
    // The intake form is bound to `<input type="number">` and posts a string; the
    // rest of the system must see one type.
    expect(parseAge(18).data?.age).toBe(18);
    expect(parseAge('18').data?.age).toBe(18);
    expect(typeof parseAge('18').data?.age).toBe('number');
  });

  it('stays optional — an absent age is not an error and is not invented', () => {
    const res = bookingSchema.safeParse(valid);
    expect(res.success).toBe(true);
    expect(res.data && 'age' in res.data ? res.data.age : undefined).toBeUndefined();
  });

  it('REJECTS the age that reached production, instead of storing it', () => {
    // A booking for a real 18-year-old was stored and displayed as "1Y". The
    // schema used to be `z.union([z.string(), z.number()]).optional()` — no shape,
    // integer or range check — so any of these was persisted verbatim.
    for (const age of [1, 0, -5, 200, 1e9, 18.5, 'abc', '18abc', '1e3', '', '  ', true, {}]) {
      expect(parseAge(age).success, `age ${JSON.stringify(age)} must be rejected`).toBe(false);
    }
  });

  it('reports the shared range message so the client and server agree', () => {
    expect(JSON.stringify(parseAge(1).error?.issues)).toContain(AGE_RANGE_MESSAGE);
  });

  it('enforces the bounds inclusively', () => {
    expect(parseAge(MIN_CLIENT_AGE).success).toBe(true);
    expect(parseAge(MAX_CLIENT_AGE).success).toBe(true);
    expect(parseAge(MIN_CLIENT_AGE - 1).success).toBe(false);
    expect(parseAge(MAX_CLIENT_AGE + 1).success).toBe(false);
  });

  it('applies the same rule as the intake form, so step 5 cannot submit a payload the API refuses', () => {
    const formBase = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '9999999999',
      gender: 'Female',
      consent: true,
    };
    for (const age of ['18', '13', '120']) {
      expect(bookingFormSchema.safeParse({ ...formBase, age }).success).toBe(true);
      expect(parseAge(age).success).toBe(true);
    }
    for (const age of ['1', '0', '121', '18abc', '']) {
      expect(bookingFormSchema.safeParse({ ...formBase, age }).success).toBe(false);
      expect(parseAge(age).success).toBe(false);
    }
  });
});

describe('rescheduleBookingSchema / lockSlotSchema', () => {
  it('applies the same date and time shape as booking creation', () => {
    const base = { bookingId: 'bk_1', therapistId: 'th_1', date: '2026-09-02', time: '09:00' };
    expect(rescheduleBookingSchema.safeParse(base).success).toBe(true);
    expect(rescheduleBookingSchema.safeParse({ ...base, time: '9:00' }).success).toBe(false);
    expect(rescheduleBookingSchema.safeParse({ ...base, date: '2026-9-2' }).success).toBe(false);

    expect(lockSlotSchema.safeParse({ therapistId: 'th_1', date: '2026-09-02', time: '09:00' }).success).toBe(true);
    expect(lockSlotSchema.safeParse({ therapistId: 'th_1', date: '2026-09-02', time: '9:00' }).success).toBe(false);
  });
});

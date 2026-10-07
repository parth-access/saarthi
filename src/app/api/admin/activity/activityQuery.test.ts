import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  planActivityQuery,
  ACTIVITY_INDEX_REQUIREMENTS,
  ACTIVITY_PAGE_SIZE_MAX,
} from '@/domains/admin/activityQuery';

/**
 * The plan is the contract between what the console offers and what Firestore
 * can serve. These tests pin both halves: the refusal rules, and — the pair
 * that earns its keep — every declared composite index actually existing in
 * `firestore.indexes.json`, so a plan that drifts from the index file fails in
 * CI instead of failing in production with a Firestore error.
 */
const INDEXES_FILE = join(process.cwd(), 'firestore.indexes.json');

describe('planActivityQuery', () => {
  it('allows no filter and defaults the page size and source', () => {
    const plan = planActivityQuery({});
    expect(plan).toEqual({ ok: true, source: 'timeline', filter: null, pageSize: 30 });
  });

  it('accepts exactly one filter of each supported kind', () => {
    expect(planActivityQuery({ correlationId: 'corr_1' })).toMatchObject({
      ok: true,
      filter: { kind: 'correlationId', value: 'corr_1' },
    });
    expect(planActivityQuery({ bookingId: 'bk_1' })).toMatchObject({
      ok: true,
      filter: { kind: 'bookingId', value: 'bk_1' },
    });
    expect(planActivityQuery({ severity: 'error' })).toMatchObject({
      ok: true,
      filter: { kind: 'severity', value: 'error' },
    });
    expect(planActivityQuery({ event: 'BookingConfirmed' })).toMatchObject({
      ok: true,
      filter: { kind: 'event', value: 'BookingConfirmed' },
    });
    expect(planActivityQuery({ actorType: 'admin' })).toMatchObject({
      ok: true,
      filter: { kind: 'actorType', value: 'admin' },
    });
  });

  it('refuses two filters at once with a readable explanation', () => {
    const plan = planActivityQuery({ severity: 'error', bookingId: 'bk_1' });
    expect(plan.ok).toBe(false);
    expect(plan.ok ? null : plan.code).toBe('UNSUPPORTED_COMBINATION');
    expect(plan.ok ? null : plan.message).toContain('One filter at a time');
  });

  it('validates enum values against the written vocabulary', () => {
    expect(planActivityQuery({ severity: 'catastrophic' }).ok).toBe(false);
    expect(planActivityQuery({ actorType: 'ghost' }).ok).toBe(false);
    expect(planActivityQuery({ bookingId: '../etc' }).ok).toBe(false);
  });

  it('clamps the page size into the declared range', () => {
    expect(planActivityQuery({ pageSize: '999' }).ok ? planActivityQuery({ pageSize: '999' }) : null).toMatchObject({
      ok: true,
      pageSize: ACTIVITY_PAGE_SIZE_MAX,
    });
    expect(planActivityQuery({ pageSize: 'junk' })).toMatchObject({ ok: true, pageSize: 30 });
  });
});

describe('planActivityQuery source selection', () => {
  it('accepts the audit source and its own filter axes', () => {
    expect(planActivityQuery({ source: 'audit' })).toMatchObject({
      ok: true,
      source: 'audit',
      filter: null,
    });
    expect(planActivityQuery({ source: 'audit', eventType: 'PAYMENT_SUCCEEDED' })).toMatchObject({
      ok: true,
      source: 'audit',
      filter: { kind: 'eventType', value: 'PAYMENT_SUCCEEDED' },
    });
    expect(planActivityQuery({ source: 'audit', userId: 'uid_admin' })).toMatchObject({
      ok: true,
      source: 'audit',
      filter: { kind: 'userId', value: 'uid_admin' },
    });
  });

  it('refuses an unknown source instead of silently reading the default', () => {
    const plan = planActivityQuery({ source: 'everything' });
    expect(plan.ok).toBe(false);
    expect(plan.ok ? null : plan.code).toBe('INVALID_PARAM');
    expect(plan.ok ? null : plan.message).toContain('Source is one of timeline, audit');
  });

  it('refuses a timeline filter on the audit source and says where the axis belongs', () => {
    const plan = planActivityQuery({ source: 'audit', severity: 'error' });
    expect(plan.ok).toBe(false);
    expect(plan.ok ? null : plan.code).toBe('UNSUPPORTED_COMBINATION');
    expect(plan.ok ? null : plan.message).toContain('event type or actor id');
  });

  it('refuses an audit filter on the timeline source and names the other ledger', () => {
    const plan = planActivityQuery({ eventType: 'USER_ROLE_CHANGED' });
    expect(plan.ok).toBe(false);
    expect(plan.ok ? null : plan.code).toBe('UNSUPPORTED_COMBINATION');
    expect(plan.ok ? null : plan.message).toContain('admin audit trail');
  });

  it('validates the audit filter values like the timeline ones', () => {
    expect(planActivityQuery({ source: 'audit', eventType: '../etc' }).ok).toBe(false);
    expect(planActivityQuery({ source: 'audit', userId: 'has spaces' }).ok).toBe(false);
  });
});

describe('index agreement', () => {
  it('declares every filter index in firestore.indexes.json', () => {
    const declared = JSON.parse(readFileSync(INDEXES_FILE, 'utf8')) as {
      indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }>;
    };

    for (const requirement of ACTIVITY_INDEX_REQUIREMENTS) {
      const match = declared.indexes.find(
        (index) =>
          index.collectionGroup === requirement.collectionGroup &&
          index.fields.length === requirement.fields.length &&
          requirement.fields.every(
            (field, i) =>
              index.fields[i]?.fieldPath === field.fieldPath && index.fields[i]?.order === field.order
          )
      );
      expect(match, `missing composite index for ${requirement.fields.map((f) => f.fieldPath).join('+')}`).toBeTruthy();
    }
  });
});

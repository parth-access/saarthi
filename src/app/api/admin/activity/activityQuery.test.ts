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
  it('allows no filter and defaults the page size', () => {
    const plan = planActivityQuery({});
    expect(plan).toEqual({ ok: true, filter: null, pageSize: 30 });
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

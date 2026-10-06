/**
 * The activity query, as a plan rather than a Firestore call.
 *
 * The bookings list established this pattern: the set of filter combinations the
 * API will serve is data, each combination names the composite index it needs,
 * and a test checks that every declared index actually exists in
 * `firestore.indexes.json`. An unsupported filter is refused with an
 * explanation — never quietly answered with a different query, and never
 * answered by downloading the collection and filtering it in memory.
 *
 * One equality filter per query, plus the ordering. Two equalities at once
 * would need a three-field composite for every pair, which is a deploy matrix
 * nobody needs: the operator filters one axis, then narrows by eye.
 */

export const ACTIVITY_PAGE_SIZE_DEFAULT = 30;
export const ACTIVITY_PAGE_SIZE_MAX = 100;

/** The severities `TimelineListener` writes. */
export const ACTIVITY_SEVERITIES = ['info', 'warning', 'error'] as const;

/** The actor types `TimelineListener` writes. */
export const ACTIVITY_ACTOR_TYPES = [
  'system',
  'patient',
  'therapist',
  'admin',
  'worker',
  'webhook',
] as const;

export type ActivityFilter =
  | { readonly kind: 'correlationId'; readonly value: string }
  | { readonly kind: 'bookingId'; readonly value: string }
  | { readonly kind: 'severity'; readonly value: string }
  | { readonly kind: 'event'; readonly value: string }
  | { readonly kind: 'actorType'; readonly value: string };

export type ActivityPlan =
  | { readonly ok: true; readonly filter: ActivityFilter | null; readonly pageSize: number }
  | { readonly ok: false; readonly code: 'INVALID_PARAM' | 'UNSUPPORTED_COMBINATION'; readonly message: string };

const ID_PARAM_PATTERN = /^[A-Za-z0-9_.-]{1,256}$/;

/**
 * Validates the query parameters into at most one filter. Anything the console
 * does not declare is a named refusal, in words an operator can read.
 */
export function planActivityQuery(params: {
  correlationId?: string | null;
  bookingId?: string | null;
  severity?: string | null;
  event?: string | null;
  actorType?: string | null;
  pageSize?: string | null;
}): ActivityPlan {
  const pageSizeRaw = params.pageSize ? Number(params.pageSize) : NaN;
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(Math.max(Math.trunc(pageSizeRaw), 1), ACTIVITY_PAGE_SIZE_MAX)
    : ACTIVITY_PAGE_SIZE_DEFAULT;

  const candidates: Array<[ActivityFilter['kind'], string | null | undefined, (value: string) => ActivityFilter]> = [
    ['correlationId', params.correlationId, (value) => ({ kind: 'correlationId', value })],
    ['bookingId', params.bookingId, (value) => ({ kind: 'bookingId', value })],
    ['severity', params.severity, (value) => ({ kind: 'severity', value })],
    ['event', params.event, (value) => ({ kind: 'event', value })],
    ['actorType', params.actorType, (value) => ({ kind: 'actorType', value })],
  ];

  const provided = candidates.filter(([, value]) => typeof value === 'string' && value !== '');
  if (provided.length > 1) {
    const names = provided.map(([name]) => name).join(', ');
    return {
      ok: false,
      code: 'UNSUPPORTED_COMBINATION',
      message: `One filter at a time: ${names} were all set, and combining them has no index. Filter one axis, then narrow by eye.`,
    };
  }

  if (provided.length === 1) {
    const [kind, raw, build] = provided[0];
    const value = (raw as string).trim();

    if ((kind === 'correlationId' || kind === 'bookingId' || kind === 'event') && !ID_PARAM_PATTERN.test(value)) {
      return {
        ok: false,
        code: 'INVALID_PARAM',
        message: 'That filter value is not readable. Ids are letters, digits, dashes and underscores.',
      };
    }
    if (kind === 'severity' && !(ACTIVITY_SEVERITIES as readonly string[]).includes(value)) {
      return {
        ok: false,
        code: 'INVALID_PARAM',
        message: 'Severity is one of info, warning, error.',
      };
    }
    if (kind === 'actorType' && !(ACTIVITY_ACTOR_TYPES as readonly string[]).includes(value)) {
      return {
        ok: false,
        code: 'INVALID_PARAM',
        message: 'Actor is one of system, patient, therapist, admin, worker, webhook.',
      };
    }
    return { ok: true, filter: build(value), pageSize };
  }

  return { ok: true, filter: null, pageSize };
}

/**
 * The composite indexes this query family needs, in the shape
 * `firestore.indexes.json` declares them — the test that keeps this module and
 * that file honest reads this list.
 */
export const ACTIVITY_INDEX_REQUIREMENTS: ReadonlyArray<{
  collectionGroup: 'timelines';
  fields: ReadonlyArray<{ fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }>;
}> = [
  {
    collectionGroup: 'timelines',
    fields: [
      { fieldPath: 'correlationId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'timelines',
    fields: [
      { fieldPath: 'bookingId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'timelines',
    fields: [
      { fieldPath: 'severity', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'timelines',
    fields: [
      { fieldPath: 'event', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'timelines',
    fields: [
      { fieldPath: 'actor.type', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
];

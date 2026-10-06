import { describe, it, expect } from 'vitest';
import {
  correlationChain,
  configurationCheck,
  severityBadge,
  actorLabel,
  CORRELATION_SLICE_BOUND,
  METRICS_CAVEAT,
  type TimelineRow,
} from '@/domains/admin/operationsTriage';

function row(overrides: Partial<TimelineRow> = {}): TimelineRow {
  return {
    id: 'tl_1',
    event: 'BookingConfirmed',
    severity: 'info',
    message: 'm',
    actorType: 'system',
    correlationId: 'corr_1',
    bookingId: 'bk_1',
    paymentId: null,
    emailId: null,
    createdAtIso: null,
    ...overrides,
  };
}

describe('correlationChain', () => {
  it('stitches only the rows carrying the correlation', () => {
    const rows = [row(), row({ id: 'tl_2', correlationId: 'corr_2' }), row({ id: 'tl_3' })];
    expect(correlationChain(rows, 'corr_1')).toHaveLength(2);
  });
});

describe('severityBadge', () => {
  it('maps the three written severities and stays neutral otherwise', () => {
    expect(severityBadge('error').tone).toBe('danger');
    expect(severityBadge('warning').tone).toBe('warning');
    expect(severityBadge('info').tone).toBe('info');
    expect(severityBadge('other').tone).toBe('neutral');
  });
});

describe('actorLabel', () => {
  it('falls back to system rather than showing a blank actor', () => {
    expect(actorLabel(null)).toBe('system');
    expect(actorLabel('admin')).toBe('admin');
  });
});

describe('configurationCheck', () => {
  it('tells presence from liveness and never shows a fake healthy', () => {
    expect(configurationCheck('Email', true).detail).toContain('not a live connection');
    expect(configurationCheck('Email', false).tone).toBe('danger');
    expect(configurationCheck('Email', null).tone).toBe('neutral');
  });
});

describe('honesty copy', () => {
  it('admits the slice bound and the metrics caveats', () => {
    expect(CORRELATION_SLICE_BOUND).toContain('not on screen');
    expect(METRICS_CAVEAT).toContain('slot holds');
    expect(METRICS_CAVEAT).toContain('UTC');
  });
});

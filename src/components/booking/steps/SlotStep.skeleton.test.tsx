import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SlotStep } from './SlotStep';

// Mock framer-motion to keep the test DOM-focused.
vi.mock('framer-motion', () => ({
  motion: { div: 'div', span: 'span' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => true,
}));

// Mock the availability hook; the server logic is covered by route.test.ts.
const mockUseAvailability = vi.fn();
vi.mock('../../../hooks/useAvailability', () => ({
  useAvailability: (...args: unknown[]) => mockUseAvailability(...args),
}));

const baseProps = {
  therapistId: 'th_1',
  date: '2026-09-15',
  onSelect: () => {},
  onBack: () => {},
  lockingTime: null,
};

function html(props: typeof baseProps & { date?: string }): string {
  return renderToStaticMarkup(React.createElement(SlotStep, props));
}

beforeEach(() => {
  mockUseAvailability.mockReset();
});

describe('SlotStep loading skeleton', () => {
  it('renders the skeleton grid (no real slot pills) while loading', () => {
    mockUseAvailability.mockReturnValue({
      slots: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    const markup = html(baseProps);

    // 12+ skeleton pill placeholders with the real pill geometry class.
    const pillCount = (markup.match(/h-\[54px\]/g) || []).length;
    expect(pillCount).toBe(12);
    // No "Available Slots" heading yet (that belongs to the loaded state).
    expect(markup).not.toContain('Available Slots');
    // No interactive buttons while loading.
    expect(markup).not.toContain('<button');
  });

  it('renders real slots once loading completes', () => {
    mockUseAvailability.mockReturnValue({
      slots: [
        { time: '09:00', isAvailable: true, reason: null },
        { time: '09:45', isAvailable: false, reason: 'Booked' },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    const markup = html(baseProps);

    expect(markup).toContain('Available Slots');
    expect(markup).toContain('aria-label="Select 9:00 AM"');
    // Booked slot is rendered disabled with its tone label.
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Booked');
  });

  it('shows the error state when the request fails (not a skeleton)', () => {
    mockUseAvailability.mockReturnValue({
      slots: [],
      loading: false,
      error: 'Unable to check slot availability. Please try again.',
      refetch: vi.fn(),
    });

    const markup = html(baseProps);

    expect(markup).toContain('Unable to Check Slots');
    expect(markup).toContain('Try Again');
    // No skeleton pill grid in the error state.
    expect(markup).not.toContain('h-[54px]');
  });

  it('shows the empty-availability state', () => {
    mockUseAvailability.mockReturnValue({
      slots: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    const markup = html(baseProps);

    expect(markup).toContain('No availability on this day.');
    expect(markup).not.toContain('h-[54px]');
  });

  it('shows no stale slots when a new request is in flight (date changed)', () => {
    // First render: slots loaded.
    mockUseAvailability.mockReturnValueOnce({
      slots: [{ time: '09:00', isAvailable: true, reason: null }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    // Date change triggers a reload: hook returns loading with no slots yet.
    mockUseAvailability.mockReturnValueOnce({
      slots: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    const loadedMarkup = html({ ...baseProps, date: '2026-09-15' });
    expect(loadedMarkup).toContain('aria-label="Select 9:00 AM"');

    const reloadingMarkup = html({ ...baseProps, date: '2026-09-16' });

    // Old slots must NOT be visible during the new load — the hook cleared
    // them and the skeleton replaced the grid.
    expect(reloadingMarkup).not.toContain('Select 9:00 AM');
    expect(reloadingMarkup).not.toContain('<button');
    expect((reloadingMarkup.match(/h-\[54px\]/g) || []).length).toBe(12);
  });

  it('keeps the weekday/date structure visible during loading', () => {
    mockUseAvailability.mockReturnValue({
      slots: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    const markup = html({ ...baseProps, date: '2026-09-15' });

    // The date is rendered immediately (aria-label carries the formatted date).
    expect(markup).toContain('September 15, 2026');
  });
});

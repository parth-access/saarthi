import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { advanceBreath, initialBreathTick, BreathingPlayer, type BreathingPhase } from './BreathingPlayer';

/**
 * The dashboard's breathing guide is driven by `advanceBreath`, so the pacing
 * users actually see is covered here without needing a DOM.
 */
const BOX: BreathingPhase[] = [
  { label: 'Breathe in', seconds: 4 },
  { label: 'Hold', seconds: 4 },
  { label: 'Breathe out', seconds: 4 },
  { label: 'Hold', seconds: 4 },
];

const FOUR_SEVEN_EIGHT: BreathingPhase[] = [
  { label: 'Breathe in', seconds: 4 },
  { label: 'Hold', seconds: 7 },
  { label: 'Breathe out', seconds: 8 },
];

/** Run `ticks` one-second steps from the initial state. */
function run(phases: BreathingPhase[], ticks: number) {
  let state = initialBreathTick(phases);
  for (let i = 0; i < ticks; i++) state = advanceBreath(phases, state);
  return state;
}

describe('advanceBreath', () => {
  it('starts on the first phase with its full duration and no rounds', () => {
    expect(initialBreathTick(BOX)).toEqual({ phaseIndex: 0, remaining: 4, cycles: 0 });
    expect(initialBreathTick(FOUR_SEVEN_EIGHT)).toEqual({ phaseIndex: 0, remaining: 4, cycles: 0 });
  });

  it('counts the current phase down one second at a time', () => {
    expect(run(BOX, 1)).toEqual({ phaseIndex: 0, remaining: 3, cycles: 0 });
    expect(run(BOX, 3)).toEqual({ phaseIndex: 0, remaining: 1, cycles: 0 });
  });

  it('advances to the next phase with its own duration when the phase runs out', () => {
    expect(run(BOX, 4)).toEqual({ phaseIndex: 1, remaining: 4, cycles: 0 });
    // 4-7-8: after the 4s inhale the hold is 7s, then the exhale is 8s.
    expect(run(FOUR_SEVEN_EIGHT, 4)).toEqual({ phaseIndex: 1, remaining: 7, cycles: 0 });
    expect(run(FOUR_SEVEN_EIGHT, 11)).toEqual({ phaseIndex: 2, remaining: 8, cycles: 0 });
  });

  it('banks a completed round only when it wraps back to the first phase', () => {
    expect(run(BOX, 15)).toEqual({ phaseIndex: 3, remaining: 1, cycles: 0 });
    expect(run(BOX, 16)).toEqual({ phaseIndex: 0, remaining: 4, cycles: 1 });
    expect(run(BOX, 32)).toEqual({ phaseIndex: 0, remaining: 4, cycles: 2 });
    // 4 + 7 + 8 = 19 seconds per round.
    expect(run(FOUR_SEVEN_EIGHT, 19)).toEqual({ phaseIndex: 0, remaining: 4, cycles: 1 });
  });

  it('is pure — the state passed in is never mutated', () => {
    const state = initialBreathTick(BOX);
    const snapshot = { ...state };
    advanceBreath(BOX, state);
    expect(state).toEqual(snapshot);
  });

  it('returns the state unchanged for an empty pattern instead of throwing', () => {
    const state = { phaseIndex: 0, remaining: 0, cycles: 0 };
    expect(advanceBreath([], state)).toBe(state);
  });
});

describe('BreathingPlayer', () => {
  it('renders the idle state with a Start control', () => {
    const html = renderToStaticMarkup(
      React.createElement(BreathingPlayer, {
        pattern: { id: 'box', title: 'Box Breathing', desc: '', color: 'bg-white', phases: BOX },
      })
    );
    expect(html).toContain('Ready when you are');
    expect(html).toContain('Start');
    // The countdown starts at the first phase's length.
    expect(html).toContain('>4<');
  });
});

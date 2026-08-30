import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LogEntry, reasonFor } from './LogEntry';

import type { LogEntryData, MarkedMovie } from './types';

const SCORED: MarkedMovie = {
  tmdbId: 11,
  title: 'Ancient',
  rank: 3,
  pressure: 918.4,
  sizeGb: 12,
  ageDays: 412.6,
  ageAnchor: 'acquired',
  watchCount: 0,
  quality: 0.618,
  qualitySource: 'blended',
  keepWeight: 2.5,
};

function entry(details: unknown): LogEntryData {
  return {
    id: 1,
    executedAt: '2026-08-30T00:00:00.000Z',
    moviesMarkedLeaving: 1,
    moviesRemoved: 0,
    moviesAdded: 0,
    removalsFailed: 0,
    freeSpaceGb: 50,
    targetFreeGb: 100,
    skippedReason: null,
    details: JSON.stringify(details),
  };
}

describe('reasonFor', () => {
  it('reads back every component the ranking recorded', () => {
    expect(reasonFor(SCORED)).toBe('#3 · 413d on disk · watched 0× · quality 0.62 · pressure 918');
  });

  it('says when the clock is anchored on a watch rather than the download', () => {
    expect(reasonFor({ ...SCORED, ageAnchor: 'watched' })).toContain('413d since watched');
  });

  it('does not pluralise a single watch', () => {
    expect(reasonFor({ ...SCORED, watchCount: 1 })).toContain('watched once');
  });

  it('has nothing to say about an entry written before the scored engine', () => {
    expect(reasonFor({ tmdbId: 11, title: 'Ancient' })).toBeNull();
  });
});

describe('LogEntry', () => {
  it('still renders a pre-scoring log entry, title only', () => {
    render(<LogEntry entry={entry({ marked: [{ tmdbId: 11, title: 'Ancient' }] })} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Ancient')).toBeInTheDocument();
    expect(screen.queryByText(/pressure/)).not.toBeInTheDocument();
  });
});

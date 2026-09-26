import { Box } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { rankEntries, rankMatch } from './palette-rank';

import type { PaletteCommand } from './types';

const record = (id: string, label: string, keywords: string[] = []): PaletteCommand => ({
  id,
  label,
  group: 'records',
  icon: Box,
  keywords,
});

const records = [
  record('a', 'Cable tub', ['T02']),
  record('b', 'HDMI cable 2 m'),
  record('c', 'Kettle', ['cable drawer']),
];

describe('ranking', () => {
  it('ranks a label prefix, then a word prefix, above contains, above another field', () => {
    expect(rankMatch('cab', 'Cable tub')).toBe(3);
    expect(rankMatch('cab', 'HDMI cable')).toBe(3);
    expect(rankMatch('abl', 'Cable tub')).toBe(2);
    expect(rankMatch('t02', 'Cable tub', ['T02'])).toBe(1);
    expect(rankMatch('zzz', 'Cable tub', ['T02'])).toBe(0);
  });

  it('ignores case and accents, and treats an empty query as a match', () => {
    expect(rankMatch('CAFE', 'Café table')).toBe(3);
    expect(rankMatch('  ', 'Anything')).toBe(1);
  });

  it('orders by rank and keeps source order within a rank', () => {
    expect(rankEntries('cable', records).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(rankEntries('drawer', records).map((entry) => entry.id)).toEqual(['c']);
  });
});

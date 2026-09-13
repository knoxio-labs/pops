import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PatternCell } from './PatternCell';

import type { TagRule, TagRuleOverlap } from './types';

function rule(overrides: Partial<TagRule> = {}): TagRule {
  return {
    id: 'r1',
    descriptionPattern: 'ROYAL HOTEL',
    matchType: 'contains',
    entityId: null,
    tags: ['venue:pub'],
    isActive: true,
    confidence: 1,
    priority: 0,
    timesApplied: 0,
    createdAt: '2026-01-01T00:00:00Z',
    lastUsedAt: null,
    ledgerMatchStatus: 'matched',
    overlaps: [],
    ...overrides,
  };
}

function overlap(descriptionPattern: string, kind: TagRuleOverlap['kind']): TagRuleOverlap {
  return { ruleId: `id-${descriptionPattern}`, descriptionPattern, kind };
}

describe('PatternCell (POPS-3691)', () => {
  it('shows only the pattern for a rule nothing overlaps', () => {
    render(<PatternCell rule={rule()} />);
    expect(screen.getByText('ROYAL HOTEL')).toBeInTheDocument();
    expect(screen.queryByText(/contradicts|redundant|never matches/i)).toBeNull();
  });

  it('names the rule it contradicts', () => {
    render(<PatternCell rule={rule({ overlaps: [overlap('HOTEL', 'contradicts')] })} />);
    expect(screen.getByText('Contradicts “HOTEL”')).toBeInTheDocument();
  });

  it('counts the rules it contradicts when there are several, and names each in the tooltip', () => {
    render(
      <PatternCell
        rule={rule({
          overlaps: [overlap('HOTEL', 'contradicts'), overlap('ROYAL', 'contradicts')],
        })}
      />
    );
    const badge = screen.getByText('Contradicts 2 rules');
    expect(badge.getAttribute('title')).toContain('“HOTEL”');
    expect(badge.getAttribute('title')).toContain('“ROYAL”');
  });

  it('names the rule it is redundant with', () => {
    render(<PatternCell rule={rule({ overlaps: [overlap('WOOLWORTHS', 'redundant')] })} />);
    expect(screen.getByText('Redundant with “WOOLWORTHS”')).toBeInTheDocument();
    expect(screen.queryByText(/contradicts/i)).toBeNull();
  });

  it('shows both marks when a rule contradicts one rule and duplicates another', () => {
    render(
      <PatternCell
        rule={rule({
          overlaps: [overlap('HOTEL', 'contradicts'), overlap('ROYAL HOTEL SYD', 'redundant')],
        })}
      />
    );
    expect(screen.getByText('Contradicts “HOTEL”')).toBeInTheDocument();
    expect(screen.getByText('Redundant with “ROYAL HOTEL SYD”')).toBeInTheDocument();
  });

  it('still marks a pattern that never matches', () => {
    render(<PatternCell rule={rule({ ledgerMatchStatus: 'broken' })} />);
    expect(screen.getByText('Never matches')).toBeInTheDocument();
  });
});

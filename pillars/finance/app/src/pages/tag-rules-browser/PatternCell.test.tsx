import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('exposes the never-matches explanation without hover and opens it on tap', async () => {
    const user = userEvent.setup();
    render(<PatternCell rule={rule({ ledgerMatchStatus: 'broken' })} />);

    const trigger = screen.getByRole('button', {
      name: 'Never matches. This pattern matches no transaction in the ledger — it can never fire',
    });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);
    const popover = await screen.findByRole('dialog');
    expect(
      within(popover).getByText(
        'This pattern matches no transaction in the ledger — it can never fire'
      )
    ).toBeInTheDocument();
  });

  it('exposes overlap explanations without hover and opens one on tap', async () => {
    const user = userEvent.setup();
    render(
      <PatternCell
        rule={rule({
          overlaps: [overlap('HOTEL', 'contradicts'), overlap('WOOLWORTHS', 'redundant')],
        })}
      />
    );

    const contradiction = screen.getByRole('button', {
      name: /Contradicts “HOTEL”\. Matches the same transactions as “HOTEL” and writes a different value/,
    });
    expect(
      screen.getByRole('button', {
        name: /Redundant with “WOOLWORTHS”\. Every transaction this matches is already given the same tags/,
      })
    ).toBeInTheDocument();

    await user.click(contradiction);
    const popover = await screen.findByRole('dialog');
    expect(
      within(popover).getByText(
        'Matches the same transactions as “HOTEL” and writes a different value on the same single-valued axis, so one of them silently loses'
      )
    ).toBeInTheDocument();
  });
});

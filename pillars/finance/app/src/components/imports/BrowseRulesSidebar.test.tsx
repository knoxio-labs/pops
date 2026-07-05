import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeMergedRules } from '../../lib/merged-state';
import { BrowseRulesSidebar } from './BrowseRulesSidebar';

import type { ChangeSet, PendingChangeSet } from '../../store/importStore';
import type { CorrectionRule } from './RulePicker';

function pendingAdd(descriptionPattern: string, entityName: string): PendingChangeSet {
  const ops: ChangeSet['ops'] = [
    { op: 'add', data: { descriptionPattern, matchType: 'exact', entityName, confidence: 0.8 } },
  ];
  return {
    tempId: `temp:changeset:${crypto.randomUUID()}`,
    changeSet: { ops },
    appliedAt: '2026-07-05T00:00:00Z',
    source: 'test',
  };
}

/** Three pending rules, each its own single-`add` ChangeSet — the #3596 scenario. */
function threePendingRules(): CorrectionRule[] {
  return computeMergedRules(
    [],
    [pendingAdd('aldi', 'Aldi'), pendingAdd('kmart', 'Kmart'), pendingAdd('bunnings', 'Bunnings')]
  );
}

function renderSidebar(rules: CorrectionRule[], selectedRuleId: string | null) {
  const onSelectRule = vi.fn<(id: string) => void>();
  const view = render(
    <BrowseRulesSidebar
      canDragReorder={false}
      orderedMerged={rules}
      orderedFiltered={rules}
      selectedRuleId={selectedRuleId}
      localOps={[]}
      onSelectRule={onSelectRule}
      onReorderFullList={vi.fn()}
    />
  );
  return { ...view, onSelectRule };
}

describe('BrowseRulesSidebar — pending rule identity (#3596)', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders each pending rule under a unique React key (no duplicate-key warning)', () => {
    const rules = threePendingRules();
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);

    renderSidebar(rules, null);

    const duplicateKeyWarning = consoleError.mock.calls.some(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('Encountered two children with the same key')
    );
    expect(duplicateKeyWarning).toBe(false);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('selecting one pending rule reports its own id, not a shared placeholder', async () => {
    const rules = threePendingRules();
    const { onSelectRule } = renderSidebar(rules, null);

    await userEvent.click(screen.getAllByRole('listitem')[1]);

    expect(onSelectRule).toHaveBeenCalledTimes(1);
    expect(onSelectRule).toHaveBeenCalledWith(rules[1].id);
    expect(rules[1].id).not.toBe(rules[0].id);
  });

  it('highlights only the selected pending row', () => {
    const rules = threePendingRules();
    const { container } = renderSidebar(rules, rules[1].id);

    const highlighted = container.querySelectorAll('li.bg-muted');
    expect(highlighted).toHaveLength(1);

    const rows = screen.getAllByRole('listitem');
    expect(rows[1]).toHaveClass('bg-muted');
    expect(rows[0]).not.toHaveClass('bg-muted');
    expect(rows[2]).not.toHaveClass('bg-muted');
  });
});

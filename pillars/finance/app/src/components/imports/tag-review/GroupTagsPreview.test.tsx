import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { orderTagsByFacet } from '../../../lib/tags';
import { EntityGroup } from './EntityGroup';
import { GroupTagsPreview } from './GroupTagsPreview';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

import type { TagMetaEntry } from '../../tag-editor/utils';

const FIVE_TAGS = ['Groceries', 'Organic', 'Bulk', 'Weekly', 'Pantry'];

function rulePerTag(tags: string[]): Map<string, TagMetaEntry[]> {
  return new Map(
    tags.map((tag) => [tag, [{ source: 'rule', pattern: `PATTERN-${tag.toUpperCase()}` }]])
  );
}

function hiddenOf(tags: string[]): string[] {
  return orderTagsByFacet(tags)
    .slice(3)
    .map((parsed) => parsed.raw);
}

function shownOf(tags: string[]): string[] {
  return orderTagsByFacet(tags)
    .slice(0, 3)
    .map((parsed) => parsed.raw);
}

describe('GroupTagsPreview (POPS-252)', () => {
  it('renders nothing for a group with no tags', () => {
    const { container } = render(<GroupTagsPreview tags={[]} sources={new Map()} />);
    expect(container.firstChild).toBeNull();
  });

  it('marks each tag it shows with the icon and tooltip of its source', () => {
    render(
      <GroupTagsPreview
        tags={['Groceries']}
        sources={new Map([['Groceries', [{ source: 'rule', pattern: 'WOOLWORTHS' }]]])}
      />
    );
    const badge = document.querySelector('[data-tag="Groceries"]');
    expect(badge?.textContent).toContain('📋');
    expect(badge?.getAttribute('title')).toContain('Rule: "WOOLWORTHS"');
  });

  it('offers no overflow when three tags or fewer', () => {
    render(<GroupTagsPreview tags={FIVE_TAGS.slice(0, 3)} sources={rulePerTag(FIVE_TAGS)} />);
    expect(screen.queryByRole('button', { name: /more tags/i })).toBeNull();
  });

  it('lists every hidden tag with the rule that supplied it behind +N', async () => {
    render(<GroupTagsPreview tags={FIVE_TAGS} sources={rulePerTag(FIVE_TAGS)} />);

    fireEvent.click(screen.getByRole('button', { name: /2 more tags/i }));

    for (const tag of hiddenOf(FIVE_TAGS)) {
      expect(
        await screen.findByText(new RegExp(`PATTERN-${tag.toUpperCase()}`))
      ).toBeInTheDocument();
    }
    for (const tag of shownOf(FIVE_TAGS)) {
      expect(screen.queryByText(new RegExp(`PATTERN-${tag.toUpperCase()}`))).toBeNull();
    }
  });

  it('says a hidden tag nothing suggested was added by hand', async () => {
    const sources = rulePerTag(FIVE_TAGS);
    const [firstHidden] = hiddenOf(FIVE_TAGS);
    sources.delete(firstHidden!);
    render(<GroupTagsPreview tags={FIVE_TAGS} sources={sources} />);

    fireEvent.click(screen.getByRole('button', { name: /2 more tags/i }));

    expect(await screen.findByText(/added by hand/i)).toBeInTheDocument();
  });

  it('shows a merchant default as a source, not only rules', async () => {
    const sources = rulePerTag(FIVE_TAGS);
    const [firstHidden] = hiddenOf(FIVE_TAGS);
    sources.set(firstHidden!, [{ source: 'entity' }]);
    render(<GroupTagsPreview tags={FIVE_TAGS} sources={sources} />);

    fireEvent.click(screen.getByRole('button', { name: /2 more tags/i }));

    expect(await screen.findByText('🏪', { exact: false })).toBeInTheDocument();
  });
});

describe('EntityGroup header past three tags (POPS-252)', () => {
  it('lets a hidden tag be traced to the rule re-applying it', async () => {
    const txn: ConfirmedTransaction = {
      date: '2026-03-01',
      description: 'WOOLWORTHS METRO',
      amount: -40,
      dialectAccountLabel: 'Amex',
      rawRow: '{}',
      checksum: 'w1',
      entityId: 'woolworths-id',
      entityName: 'Woolworths',
      tags: FIVE_TAGS,
    };
    const suggested: SuggestedTag[] = FIVE_TAGS.map((tag) => ({
      tag,
      source: 'rule',
      pattern: `PATTERN-${tag.toUpperCase()}`,
    }));
    render(
      <EntityGroup
        group={{ entityName: 'Woolworths', transactions: [txn] }}
        localTags={{ w1: FIVE_TAGS }}
        suggestedTagMeta={{ w1: suggested }}
        availableTags={FIVE_TAGS}
        facets={[]}
        onUpdateTag={vi.fn()}
        onApplyGroupTags={vi.fn()}
        onRemoveGroupTag={vi.fn()}
        onSaveTagRule={vi.fn()}
        onSaveTagRuleForTransaction={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /2 more tags/i }));

    const [hidden] = hiddenOf(FIVE_TAGS);
    expect(
      await screen.findByText(new RegExp(`PATTERN-${hidden!.toUpperCase()}`))
    ).toBeInTheDocument();
  });
});

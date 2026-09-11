/**
 * The tag-rule dialog refuses to stage a rule that would write a value a closed
 * axis does not hold (POPS-3106). Before, the rule staged cleanly and the whole
 * import was rejected at commit over a tag the user could no longer see.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagRuleProposalDialog } from './TagRuleProposalDialog';

const { mockPropose } = vi.hoisted(() => ({ mockPropose: vi.fn() }));

vi.mock('../../finance-api/index.js', () => ({
  tagRulesPropose: (...args: unknown[]) => mockPropose(...args),
  tagRulesApply: vi.fn(),
  tagRulesReject: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

function proposalWriting(tags: string[]) {
  return {
    data: {
      changeSet: {
        source: 'tag-review',
        ops: [{ op: 'add', data: { descriptionPattern: 'GRIFFIN', matchType: 'contains', tags } }],
      },
      rationale: 'Seen on every Griffin row',
      preview: {
        counts: { affected: 0, suggestionChanges: 0, removed: 0, newTagProposals: 0 },
        affected: [],
        newTags: [],
      },
    },
    error: undefined,
  };
}

function renderDialog(tags: string[], vocabularyTags?: string[]): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <TagRuleProposalDialog
        open
        onOpenChange={() => {}}
        signal={{ descriptionPattern: 'GRIFFIN', matchType: 'contains', entityId: null, tags }}
        previewTransactions={[{ checksum: 'a', description: 'GRIFFIN HOTEL' }]}
        facets={[{ facet: 'venue', kind: 'closed' }]}
        {...(vocabularyTags === undefined ? {} : { vocabularyTags })}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockPropose.mockReset();
});

describe('TagRuleProposalDialog — closed tag axes', () => {
  it('names the refused value and will not save the rule', async () => {
    mockPropose.mockResolvedValue(proposalWriting(['venue:speakeasy']));
    render(renderDialog(['venue:speakeasy'], ['venue:bar']));
    expect((await screen.findByRole('alert')).textContent).toContain('venue:speakeasy');
    expect(screen.getByRole('button', { name: 'Save rule' })).toHaveProperty('disabled', true);
  });

  it('saves a rule whose closed-axis values the vocabulary holds', async () => {
    mockPropose.mockResolvedValue(proposalWriting(['venue:bar']));
    render(renderDialog(['venue:bar'], ['venue:bar']));
    await screen.findByText('Seen on every Griffin row');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save rule' })).toHaveProperty('disabled', false);
  });

  it('refuses nothing when the caller supplies no vocabulary to judge against', async () => {
    mockPropose.mockResolvedValue(proposalWriting(['venue:speakeasy']));
    render(renderDialog(['venue:speakeasy']));
    await screen.findByText('Seen on every Griffin row');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

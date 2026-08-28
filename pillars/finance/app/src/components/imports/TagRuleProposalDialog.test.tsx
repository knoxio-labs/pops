import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elementAt } from '../../test-utils';
import { TagRuleProposalDialog } from './TagRuleProposalDialog';

// ---------------------------------------------------------------------------
// Hoisted finance SDK mocks (referenced inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockPropose, mockApply, mockReject } = vi.hoisted(() => ({
  mockPropose: vi.fn(),
  mockApply: vi.fn(),
  mockReject: vi.fn(),
}));

type ProposeData = {
  changeSet: { source?: string; reason?: string; ops: Array<Record<string, unknown>> };
  rationale: string;
  preview: {
    counts: {
      affected: number;
      suggestionChanges: number;
      removed: number;
      newTagProposals: number;
    };
    affected: unknown[];
    newTags: string[];
  };
} | null;

vi.mock('../../finance-api/index.js', () => ({
  tagRulesPropose: (...args: unknown[]) => mockPropose(...args),
  tagRulesApply: (...args: unknown[]) => mockApply(...args),
  tagRulesReject: (...args: unknown[]) => mockReject(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const signal = {
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains' as const,
  entityId: null,
  tags: ['Groceries'],
};

const baseProposal: ProposeData = {
  changeSet: {
    source: 'tag-edit-signal',
    reason: 'Create new tag rule from tag edit signal',
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: 'WOOLWORTHS',
          matchType: 'contains',
          entityId: null,
          tags: ['Groceries'],
          confidence: 0.95,
          isActive: true,
        },
      },
    ],
  },
  rationale: 'Add new tag rule (contains:WOOLWORTHS) from tag edit signal',
  preview: {
    counts: { affected: 1, suggestionChanges: 1, removed: 0, newTagProposals: 0 },
    affected: [
      {
        transactionId: 't1',
        description: 'WOOLWORTHS 1234',
        before: { suggestedTags: [] },
        after: { suggestedTags: [{ tag: 'Groceries', source: 'tag_rule', isNew: false }] },
      },
    ],
    newTags: [],
  },
};

/** Same proposal, but the suggested tag is new to the vocabulary — drives the accept/decline panel. */
const proposalWithNewTag: ProposeData = {
  ...baseProposal,
  preview: {
    counts: { affected: 1, suggestionChanges: 1, removed: 0, newTagProposals: 1 },
    affected: [
      {
        transactionId: 't1',
        description: 'WOOLWORTHS 1234',
        before: { suggestedTags: [] },
        after: { suggestedTags: [{ tag: 'Groceries', source: 'rule', isNew: true }] },
      },
    ],
    newTags: ['Groceries'],
  },
};

function proposalWith(preview: Partial<NonNullable<ProposeData>['preview']>): ProposeData {
  const base = baseProposal as NonNullable<ProposeData>;
  return { ...base, preview: { ...base.preview, ...preview } };
}

function withClient(node: ReactElement): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>;
}

function renderDialog(onOpenChange = vi.fn(), onApplied = vi.fn()) {
  return render(
    withClient(
      <TagRuleProposalDialog
        open={true}
        onOpenChange={onOpenChange}
        signal={signal}
        previewTransactions={[{ checksum: 't1', description: 'WOOLWORTHS 1234', entityId: null }]}
        onApplied={onApplied}
      />
    )
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TagRuleProposalDialog', () => {
  beforeEach(() => {
    mockPropose.mockReset();
    mockApply.mockReset();
    mockReject.mockReset();
    vi.mocked(toast.message).mockClear();
    mockPropose.mockResolvedValue({ data: baseProposal, error: undefined });
    mockApply.mockResolvedValue({ data: { rules: [] }, error: undefined });
    mockReject.mockResolvedValue({ data: { message: 'Rejection recorded' }, error: undefined });
  });

  it('issues the propose query and renders the proposal rationale', async () => {
    renderDialog();
    expect(await screen.findByText(/contains:WOOLWORTHS/i)).toBeDefined();
    expect(mockPropose).toHaveBeenCalledWith({
      body: expect.objectContaining({
        signal: expect.objectContaining({ descriptionPattern: 'WOOLWORTHS', tags: ['Groceries'] }),
      }),
    });
  });

  it('reports the uncapped totals, not the length of the rendered list', async () => {
    mockPropose.mockResolvedValue({
      data: proposalWith({
        counts: { affected: 120, suggestionChanges: 145, removed: 25, newTagProposals: 0 },
      }),
      error: undefined,
    });
    renderDialog();

    const summary = await screen.findByTestId('impact-summary');
    expect(summary).toHaveTextContent('120 rows');
    expect(summary).toHaveTextContent('145 tag changes');
    expect(summary).toHaveTextContent('25 removed');
  });

  it('says how many affected rows are not listed when the detail is truncated', async () => {
    mockPropose.mockResolvedValue({
      data: proposalWith({
        counts: { affected: 120, suggestionChanges: 120, removed: 0, newTagProposals: 0 },
      }),
      error: undefined,
    });
    renderDialog();

    // One row of detail against a total of 120 — the rest must be admitted to.
    expect(await screen.findByTestId('impact-unlisted')).toHaveTextContent('+119 more not listed');
  });

  it('omits the truncation notice when every affected row is listed', async () => {
    renderDialog();

    await screen.findByTestId('impact-summary');
    expect(screen.queryByTestId('impact-unlisted')).not.toBeInTheDocument();
  });

  it('offers a new vocabulary tag whose only row fell past the detail cap', async () => {
    mockPropose.mockResolvedValue({
      data: proposalWith({
        counts: { affected: 120, suggestionChanges: 120, removed: 0, newTagProposals: 4 },
        newTags: ['Weekly'],
      }),
      error: undefined,
    });
    renderDialog();

    expect(await screen.findByText('Weekly')).toBeInTheDocument();
  });

  it('stages the rule without writing: no apply call, onApplied gets the accepted new tags', async () => {
    const onOpenChange = vi.fn();
    const onApplied = vi.fn();
    mockPropose.mockResolvedValue({ data: proposalWithNewTag, error: undefined });
    renderDialog(onOpenChange, onApplied);
    await screen.findByText(/contains:WOOLWORTHS/i);
    await screen.findByLabelText(/Groceries/i);

    fireEvent.click(screen.getByRole('button', { name: /save rule/i }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
    expect(mockApply).not.toHaveBeenCalled();
    const [changeSet, affected, acceptedNewTags] = elementAt(onApplied.mock.calls, 0);
    expect(changeSet).toEqual(proposalWithNewTag.changeSet);
    expect(affected).toEqual(proposalWithNewTag.preview.affected);
    expect(acceptedNewTags).toEqual(['Groceries']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('excludes a new tag the user unchecked from the staged accepted set', async () => {
    const onApplied = vi.fn();
    mockPropose.mockResolvedValue({ data: proposalWithNewTag, error: undefined });
    renderDialog(vi.fn(), onApplied);
    await screen.findByText(/contains:WOOLWORTHS/i);

    fireEvent.click(await screen.findByLabelText(/Groceries/i));
    fireEvent.click(screen.getByRole('button', { name: /save rule/i }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
    expect(mockApply).not.toHaveBeenCalled();
    expect(elementAt(onApplied.mock.calls, 0)[2]).toEqual([]);
  });

  it('shows the reject feedback textarea after clicking "Reject…"', async () => {
    renderDialog();
    await screen.findByText(/contains:WOOLWORTHS/i);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/feedback/i)).toBeDefined();
    });
  });

  it('calls tagRulesReject with the rejected changeSet and the feedback on confirm', async () => {
    renderDialog();
    await screen.findByText(/contains:WOOLWORTHS/i);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Too broad' } });

    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() => expect(mockReject).toHaveBeenCalledOnce());
    const callArg = elementAt(mockReject.mock.calls, 0)[0] as { body: Record<string, unknown> };
    expect(callArg.body).toEqual({
      changeSet: baseProposal?.changeSet,
      feedback: 'Too broad',
    });
  });

  it('closes the dialog and reports only that the rejection was recorded', async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);
    await screen.findByText(/contains:WOOLWORTHS/i);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Dismiss it' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.message).toHaveBeenCalledWith('Rejection recorded');
    // The toast must not claim a revision the endpoint cannot perform (POPS-2598).
    for (const [text] of vi.mocked(toast.message).mock.calls) {
      expect(text).not.toMatch(/revis/i);
    }
  });
});

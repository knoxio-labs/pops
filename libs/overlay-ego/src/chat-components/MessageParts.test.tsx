import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { MessageParts } from './MessageParts';

import type { ActionsPart, EntityPart, MessagePart } from '../chat-hooks/message-parts';
import type { BatchDecisionApi } from '../chat-hooks/useBatchDecision';

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => children,
}));

function entity(title: string): EntityPart {
  return { type: 'entity', uri: 'pops:foo/bar/1', title };
}

function actions(
  actions: ActionsPart['actions'] = [
    { actionId: 'a1', tool: 'inventory.items.move', summary: 'Move drill', status: 'pending' },
    { actionId: 'a2', tool: 'finance.budgets.create', summary: 'Create budget', status: 'pending' },
  ]
): ActionsPart {
  return { type: 'actions', batchId: 'batch-1', actions };
}

function decisions(overrides: Partial<BatchDecisionApi> = {}): BatchDecisionApi {
  return {
    decide: vi.fn().mockResolvedValue(undefined),
    decidingBatchId: null,
    error: null,
    ...overrides,
  };
}

function renderParts(parts: MessagePart[], batchDecision: BatchDecisionApi | null = null) {
  return render(
    <MemoryRouter>
      <MessageParts parts={parts} decisions={batchDecision} />
    </MemoryRouter>
  );
}

function unknownPart(): MessagePart {
  const part: MessagePart = { type: 'text', text: 'ignored by the renderer' };
  Object.defineProperty(part, 'type', { value: 'chart' });
  return part;
}

function expectDocumentOrder(elements: HTMLElement[]) {
  for (let index = 0; index < elements.length - 1; index += 1) {
    const current = elements[index];
    const next = elements[index + 1];
    if (!current || !next) throw new Error('Expected every ordered element to exist');
    expect(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  }
}

describe('MessageParts', () => {
  it('renders text, grouped entities, and actions in part order', () => {
    const decisionApi = decisions();
    renderParts(
      [
        { type: 'text', text: 'Opening note' },
        entity('Entity one'),
        entity('Entity two'),
        { type: 'text', text: 'Closing note' },
        actions(),
      ],
      decisionApi
    );

    const relatedEntities = screen.getByRole('group', { name: 'Related entities' });
    expect(relatedEntities.querySelectorAll('[data-slot="entity-card"]')).toHaveLength(2);
    expect(screen.getByText('Opening note').className).toBe(
      'prose prose-sm prose-invert max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-2 [&_code]:text-xs'
    );
    expect(screen.getByRole('button', { name: 'Approve (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject all' })).toBeInTheDocument();
    expectDocumentOrder([
      screen.getByText('Opening note'),
      screen.getByText('Entity one'),
      screen.getByText('Entity two'),
      screen.getByText('Closing note'),
      screen.getByText('Move drill'),
    ]);
  });

  it('renders an empty array without adding content', () => {
    const { container } = renderParts([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows pending actions as awaiting a decision when decisions are unavailable', () => {
    renderParts([actions()], null);

    expect(screen.getByText('Move drill')).toBeInTheDocument();
    expect(screen.getByText('Create budget')).toBeInTheDocument();
    expect(screen.getAllByText('Awaiting your decision')).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('shows resolved batch outcomes and preserves them when approving pending actions', async () => {
    const user = userEvent.setup();
    const decisionApi = decisions();
    renderParts(
      [
        actions([
          { actionId: 'p1', tool: 'tool.pending', summary: 'Pending', status: 'pending' },
          { actionId: 'c1', tool: 'tool.confirmed', summary: 'Confirmed', status: 'confirmed' },
          { actionId: 'e1', tool: 'tool.executed', summary: 'Executed', status: 'executed' },
          { actionId: 'r1', tool: 'tool.rejected', summary: 'Rejected', status: 'rejected' },
          { actionId: 'f1', tool: 'tool.failed', summary: 'Failed', status: 'failed' },
        ]),
      ],
      decisionApi
    );

    expect(screen.getByText('Confirmed, running')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getAllByText('Rejected')).toHaveLength(2);
    expect(screen.getAllByText('Failed')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Approve (1)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve (1)' }));

    expect(decisionApi.decide).toHaveBeenCalledWith('batch-1', {
      approve: ['p1', 'c1', 'e1', 'f1'],
      reject: ['r1'],
      alwaysAllow: [],
    });
  });

  it('shows a fallback for a part type unknown to this renderer', () => {
    renderParts([unknownPart()]);

    expect(screen.getByRole('note')).toHaveTextContent('Unsupported message part');
  });
});

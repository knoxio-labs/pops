import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ActionsCard } from './ActionsCard';

import type { ActionsPart, BatchAction } from '../chat-hooks/message-parts';
import type { BatchDecisionApi } from '../chat-hooks/useBatchDecision';

const pendingActions: BatchAction[] = [
  { actionId: 'a1', tool: 'inventory.items.move', summary: 'Move drill', status: 'pending' },
  { actionId: 'a2', tool: 'finance.budgets.create', summary: 'Create budget', status: 'pending' },
  { actionId: 'a3', tool: 'inventory.items.move', summary: 'Move wrench', status: 'pending' },
];

const decidedActions: BatchAction[] = [
  { actionId: 'c1', tool: 'tool.confirmed', summary: 'Confirm action', status: 'confirmed' },
  { actionId: 'r1', tool: 'tool.rejected', summary: 'Reject action', status: 'rejected' },
];

function part(actions: BatchAction[] = pendingActions): ActionsPart {
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

describe('ActionsCard', () => {
  it('renders pending choices and approves checked actions in batch order', async () => {
    const user = userEvent.setup();
    const decisionApi = decisions();
    render(<ActionsCard part={part()} decisions={decisionApi} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.getAllByRole('checkbox', { name: /Always allow/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Approve (3)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject all' })).toBeEnabled();
    expect(screen.getAllByText('inventory.items.move')).toHaveLength(2);
    expect(screen.getByText('finance.budgets.create')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Create budget' }));
    await user.click(screen.getByRole('button', { name: 'Approve (2)' }));

    expect(decisionApi.decide).toHaveBeenCalledExactlyOnceWith('batch-1', {
      approve: ['a1', 'a3'],
      reject: ['a2'],
      alwaysAllow: [],
    });

    await user.click(screen.getByRole('checkbox', { name: 'Move drill' }));
    await user.click(screen.getByRole('checkbox', { name: 'Move wrench' }));
    expect(screen.getByRole('button', { name: 'Approve (0)' })).toBeDisabled();
  });

  it('sends an allowed tool when an action for it remains checked', async () => {
    const user = userEvent.setup();
    const decisionApi = decisions();
    render(<ActionsCard part={part()} decisions={decisionApi} />);

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Always allow inventory.items.move in this conversation',
      })
    );
    await user.click(screen.getByRole('button', { name: 'Approve (3)' }));

    expect(decisionApi.decide).toHaveBeenCalledWith('batch-1', {
      approve: ['a1', 'a2', 'a3'],
      reject: [],
      alwaysAllow: ['inventory.items.move'],
    });
  });

  it('omits an allowed tool when every action for it is unticked', async () => {
    const user = userEvent.setup();
    const decisionApi = decisions();
    render(<ActionsCard part={part()} decisions={decisionApi} />);

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Always allow inventory.items.move in this conversation',
      })
    );
    await user.click(screen.getByRole('checkbox', { name: 'Move drill' }));
    await user.click(screen.getByRole('checkbox', { name: 'Move wrench' }));
    await user.click(screen.getByRole('button', { name: 'Approve (1)' }));

    expect(decisionApi.decide).toHaveBeenCalledWith('batch-1', {
      approve: ['a2'],
      reject: ['a1', 'a3'],
      alwaysAllow: [],
    });
  });

  it('rejects every action when Reject all is selected', async () => {
    const user = userEvent.setup();
    const decisionApi = decisions();
    render(<ActionsCard part={part()} decisions={decisionApi} />);

    await user.click(screen.getByRole('button', { name: 'Reject all' }));

    expect(decisionApi.decide).toHaveBeenCalledExactlyOnceWith('batch-1', {
      approve: [],
      reject: ['a1', 'a2', 'a3'],
      alwaysAllow: [],
    });
  });

  it('shows Continue for a matching decided batch and starts continuation', async () => {
    const user = userEvent.setup();
    const continueBatch = vi.fn();
    const decisionApi = decisions({ continuableBatchId: 'batch-1', continueBatch });
    render(<ActionsCard part={part(decidedActions)} decisions={decisionApi} />);

    expect(
      screen.getByText('This decision was recorded but the actions have not finished.')
    ).toBeInTheDocument();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject all' })).not.toBeInTheDocument();

    await user.click(continueButton);

    expect(continueBatch).toHaveBeenCalledExactlyOnceWith('batch-1');
  });

  it.each([
    ['different batch ID', { continuableBatchId: 'another-batch', continueBatch: vi.fn() }],
    ['null batch ID', { continuableBatchId: null, continueBatch: vi.fn() }],
    ['missing continuation callback', { continuableBatchId: 'batch-1' }],
  ] as const)('hides Continue for a %s', (_case, overrides) => {
    const decisionApi = decisions(overrides);
    render(<ActionsCard part={part(decidedActions)} decisions={decisionApi} />);

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('never shows Continue for pending actions, even when the batch IDs match', () => {
    const decisionApi = decisions({
      continuableBatchId: 'batch-1',
      continueBatch: vi.fn(),
    });
    render(<ActionsCard part={part()} decisions={decisionApi} />);

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('does not show Continue when decisions are unavailable', () => {
    render(<ActionsCard part={part(decidedActions)} decisions={null} />);

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('disables Continue while this batch is being decided', async () => {
    const user = userEvent.setup();
    const continueBatch = vi.fn();
    const decisionApi = decisions({
      continuableBatchId: 'batch-1',
      continueBatch,
      decidingBatchId: 'batch-1',
    });
    render(<ActionsCard part={part(decidedActions)} decisions={decisionApi} />);

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    await user.click(continueButton);
    expect(continueBatch).not.toHaveBeenCalled();
  });

  it('shows pending actions as awaiting a decision when no decision API is available', () => {
    render(<ActionsCard part={part()} decisions={null} />);

    expect(screen.getAllByText('Awaiting your decision')).toHaveLength(3);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('keeps resolved actions read-only and describes each status in text', () => {
    render(
      <ActionsCard
        part={part([
          {
            actionId: 'c1',
            tool: 'tool.confirmed',
            summary: 'Confirm action',
            status: 'confirmed',
          },
          { actionId: 'e1', tool: 'tool.executed', summary: 'Execute action', status: 'executed' },
          { actionId: 'r1', tool: 'tool.rejected', summary: 'Reject action', status: 'rejected' },
          { actionId: 'f1', tool: 'tool.failed', summary: 'Fail action', status: 'failed' },
        ])}
        decisions={decisions()}
      />
    );

    expect(screen.getByText('Confirmed, running')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows controls only for pending rows in a mixed batch', async () => {
    const decisionApi = decisions();
    const user = userEvent.setup();
    render(
      <ActionsCard
        part={part([
          {
            actionId: 'a1',
            tool: 'inventory.items.move',
            summary: 'Pending move',
            status: 'pending',
          },
          {
            actionId: 'a2',
            tool: 'finance.budgets.create',
            summary: 'Finished budget',
            status: 'executed',
          },
        ])}
        decisions={decisionApi}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Pending move' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Finished budget' })).not.toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve (1)' }));
    expect(decisionApi.decide).toHaveBeenCalledWith('batch-1', {
      approve: ['a1', 'a2'],
      reject: [],
      alwaysAllow: [],
    });
  });

  it('rejects pending actions without changing resolved outcomes in a mixed batch', async () => {
    const user = userEvent.setup();
    const decisionApi = decisions();
    render(
      <ActionsCard
        part={part([
          { actionId: 'p1', tool: 'tool.pending', summary: 'Pending action', status: 'pending' },
          {
            actionId: 'c1',
            tool: 'tool.confirmed',
            summary: 'Confirmed action',
            status: 'confirmed',
          },
          { actionId: 'r1', tool: 'tool.rejected', summary: 'Rejected action', status: 'rejected' },
          { actionId: 'e1', tool: 'tool.executed', summary: 'Executed action', status: 'executed' },
          { actionId: 'f1', tool: 'tool.failed', summary: 'Failed action', status: 'failed' },
        ])}
        decisions={decisionApi}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Reject all' }));

    expect(decisionApi.decide).toHaveBeenCalledWith('batch-1', {
      approve: ['c1', 'e1', 'f1'],
      reject: ['p1', 'r1'],
      alwaysAllow: [],
    });
  });

  it('locks buttons and checkboxes while a decision for this batch is pending', async () => {
    const user = userEvent.setup();
    const decisionApi = decisions({ decidingBatchId: 'batch-1' });
    render(<ActionsCard part={part()} decisions={decisionApi} />);

    const checkboxes = screen.getAllByRole('checkbox');
    const buttons = screen.getAllByRole('button');
    expect(checkboxes).toHaveLength(5);
    expect(buttons).toHaveLength(2);
    checkboxes.forEach((checkbox) => expect(checkbox).toBeDisabled());
    buttons.forEach((button) => expect(button).toBeDisabled());

    await user.click(screen.getByRole('button', { name: 'Approve (3)' }));
    expect(decisionApi.decide).not.toHaveBeenCalled();
  });

  it('exposes decision errors and leaves the action available for a retry', async () => {
    const user = userEvent.setup();
    const decisionApi = decisions({ error: 'gateway down' });
    const { rerender } = render(<ActionsCard part={part()} decisions={decisionApi} />);

    expect(screen.getByRole('alert')).toHaveTextContent('gateway down');
    const approve = screen.getByRole('button', { name: 'Approve (3)' });
    expect(approve).toBeEnabled();
    await user.click(approve);
    expect(decisionApi.decide).toHaveBeenCalledTimes(1);

    rerender(<ActionsCard part={part()} decisions={{ ...decisionApi, error: null }} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

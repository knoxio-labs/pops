import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { MessageThread } from './MessageThread';

import type { ReactNode } from 'react';

import type { ActionsPart, MessagePart } from '../chat-hooks/message-parts';
import type { ChatMessage } from '../chat-hooks/types';
import type { BatchDecisionApi } from '../chat-hooks/useBatchDecision';
import type { MessageThreadProps } from './MessageThread';

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

const decisions: BatchDecisionApi = {
  decide: vi.fn().mockResolvedValue(undefined),
  decidingBatchId: null,
  error: null,
};

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    role: 'assistant',
    content: '',
    citations: null,
    parts: null,
    createdAt: '2026-10-03T00:00:00.000Z',
    ...overrides,
  };
}

function actionsPart(
  batchId: string,
  statuses: ActionsPart['actions'][number]['status'][] = ['pending', 'pending']
): ActionsPart {
  return {
    type: 'actions',
    batchId,
    actions: statuses.map((status, index) => ({
      actionId: `action-${index + 1}`,
      tool: `inventory.items.move-${index + 1}`,
      summary: `Move item ${index + 1}`,
      status,
    })),
  };
}

function renderThread(props: Partial<MessageThreadProps> = {}) {
  return render(
    <MemoryRouter>
      <MessageThread isLoading={false} isSending={false} messages={[]} {...props} />
    </MemoryRouter>
  );
}

describe('MessageThread', () => {
  it('renders text and entity parts once in an assistant message', () => {
    renderThread({
      messages: [
        message({
          content: 'Hello',
          citations: ['eng_part'],
          parts: [
            { type: 'text', text: 'Hello' },
            { type: 'entity', uri: 'pops:inventory/item/drill-1', title: 'Bosch drill' },
          ],
        }),
      ],
    });

    expect(screen.getByText('Bosch drill')).toBeInTheDocument();
    expect(screen.getAllByText('Hello')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /eng_part/ })).toHaveAttribute(
      'href',
      '/cerebrum/engrams/eng_part'
    );
  });

  it('preserves content for null and empty parts and citations on legacy messages', () => {
    renderThread({
      messages: [
        message({ content: 'Legacy reply', citations: ['eng_1'], parts: null }),
        message({ id: 'message-2', content: 'Empty parts reply', parts: [] }),
      ],
    });

    expect(screen.getByText('Legacy reply')).toBeInTheDocument();
    expect(screen.getByText('Empty parts reply')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /eng_1/ })).toHaveAttribute(
      'href',
      '/cerebrum/engrams/eng_1'
    );
  });

  it('shows decision controls only when the decision API is available', () => {
    const pending = message({ parts: [actionsPart('batch-1')] });

    const withDecisions = renderThread({ messages: [pending], decisions });
    expect(screen.getByRole('button', { name: 'Approve (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject all' })).toBeInTheDocument();
    withDecisions.unmount();

    renderThread({ messages: [pending] });
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject all' })).not.toBeInTheDocument();
  });

  it('shows stream tool activity without a typing indicator', () => {
    renderThread({
      isSending: true,
      streamingContent: '',
      toolActivity: [{ name: 'ego_show_entities', status: 'started' }],
    });

    expect(screen.getByText('ego show entities')).toBeInTheDocument();
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument();
  });

  it('shows the typing indicator when the active stream has no visible payload', () => {
    renderThread({ isSending: true, streamingContent: '', toolActivity: [], streamParts: [] });

    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
    expect(screen.queryByTestId('streaming-bubble')).not.toBeInTheDocument();
  });

  it('updates persisted action statuses in place and hides their stream copy', () => {
    renderThread({
      messages: [message({ parts: [actionsPart('batch-1')] })],
      isSending: true,
      streamingContent: '',
      streamParts: [actionsPart('batch-1', ['executed', 'rejected'])],
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Actions for batch batch-1' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject all' })).not.toBeInTheDocument();
  });

  it('renders unknown action batches and streamed entities without decision controls', () => {
    const parts: MessagePart[] = [
      { type: 'entity', uri: 'pops:inventory/item/drill-1', title: 'Bosch drill' },
      actionsPart('batch-new'),
    ];
    renderThread({ streamingContent: '', streamParts: parts, decisions });

    expect(screen.getByText('Bosch drill')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Actions for batch batch-new' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject all' })).not.toBeInTheDocument();
  });
});

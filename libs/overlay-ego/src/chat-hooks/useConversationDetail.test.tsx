import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '../test-utils';
import { useConversationDetail } from './useConversationDetail';

import type { ReactNode } from 'react';

const sdk = vi.hoisted(() => ({ egoGetConversation: vi.fn() }));

vi.mock('../ego-api', () => sdk);

let queryClient: ReturnType<typeof createTestQueryClient>;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function message(parts: unknown) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    role: 'assistant',
    content: 'A persisted response',
    citations: null,
    createdAt: '2026-10-03T00:00:00.000Z',
    parts,
  };
}

function mockConversation(messages: unknown[]) {
  sdk.egoGetConversation.mockResolvedValue({
    data: {
      conversation: {
        id: 'conversation-1',
        activeScopes: [],
        appContext: null,
        createdAt: '2026-10-03T00:00:00.000Z',
        model: 'test-model',
        title: 'Test conversation',
        updatedAt: '2026-10-03T00:00:00.000Z',
      },
      messages,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = createTestQueryClient();
});

describe('useConversationDetail message parts', () => {
  it('maps text and entity parts in order', async () => {
    const parts = [
      { type: 'text', text: 'A response' },
      { type: 'entity', uri: 'pops:media/tv-show/1', title: 'The show' },
    ];
    mockConversation([message(parts)]);

    const { result } = renderHook(() => useConversationDetail('conversation-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]?.parts).toEqual(parts);
  });

  it('preserves null and missing parts on legacy messages', async () => {
    mockConversation([message(null), message(undefined)]);

    const { result } = renderHook(() => useConversationDetail('conversation-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.map(({ parts }) => parts)).toEqual([null, null]);
  });

  it('drops unknown part types while retaining valid parts', async () => {
    const validPart = { type: 'text', text: 'Keep this' };
    mockConversation([message([validPart, { type: 'chart', data: [] }])]);

    const { result } = renderHook(() => useConversationDetail('conversation-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]?.parts).toEqual([validPart]);
  });
});

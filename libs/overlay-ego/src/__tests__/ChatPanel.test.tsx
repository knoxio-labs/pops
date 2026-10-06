import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

// ── Streaming chat mock ─────────────────────────────────────────────

const mockStream = vi.fn();
const streamTestConfig = vi.hoisted(() => ({ useRealStream: false }));

vi.mock('../chat-hooks/useStreamingChat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chat-hooks/useStreamingChat')>();
  return {
    ...actual,
    useStreamingChat: () => {
      const real = actual.useStreamingChat();
      return streamTestConfig.useRealStream
        ? real
        : {
            ...real,
            stream: mockStream,
            isStreaming: false,
            error: null,
            streamingContent: null,
            toolActivity: [],
            streamParts: [],
          };
    },
  };
});

// ── ego SDK mock ─────────────────────────────────────────────────────

const sdk = vi.hoisted(() => ({
  egoListConversations: vi.fn(),
  egoGetConversation: vi.fn(),
  egoDeleteConversation: vi.fn(),
  egoDecideActionBatch: vi.fn(),
}));

vi.mock('../ego-api', () => sdk);

// ── react-markdown mock ──────────────────────────────────────────────

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => children,
}));

// ── react-router mock ────────────────────────────────────────────────

vi.mock('react-router', async (importOriginal) => {
  const React = await import('react');
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
      React.createElement('a', { href: to }, children),
  };
});

vi.mock('@pops/navigation', () => ({
  useSearchResultNavigation: () => ({ navigateTo: vi.fn() }),
  useAppContext: () => ({ app: null }),
  useCurrentEntity: () => undefined,
}));

// ── UI mock ──────────────────────────────────────────────────────────

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  return {
    Button: ({ children, onClick, disabled, prefix, ...rest }: Record<string, unknown>) =>
      React.createElement(
        'button',
        {
          onClick: onClick as () => void,
          disabled: disabled as boolean,
          ...rest,
        },
        prefix as React.ReactNode,
        children as React.ReactNode
      ),
    Input: ({ value, onChange, placeholder, className, ...rest }: Record<string, unknown>) =>
      React.createElement('input', {
        type: 'text',
        value: value as string,
        onChange: onChange as () => void,
        placeholder: placeholder as string,
        className: className as string,
        'aria-label': rest['aria-label'] as string,
      }),
    Textarea: React.forwardRef(
      (
        {
          value,
          onChange,
          placeholder,
          onKeyDown,
          rows,
          className,
          ...rest
        }: Record<string, unknown>,
        ref: React.Ref<HTMLTextAreaElement>
      ) =>
        React.createElement('textarea', {
          ref,
          value: value as string,
          onChange: onChange as () => void,
          onKeyDown: onKeyDown as () => void,
          placeholder: placeholder as string,
          rows: rows as number,
          className: className as string,
          'aria-label': rest['aria-label'] as string,
          disabled: rest.disabled as boolean,
        })
    ),
    Skeleton: ({ className }: { className?: string }) =>
      React.createElement('div', {
        className: `animate-pulse ${className ?? ''}`,
        'data-testid': 'skeleton',
      }),
    Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
      React.createElement('span', { 'data-testid': 'badge', 'data-variant': variant }, children),
    EmptyState: ({
      title,
      description,
    }: {
      icon?: unknown;
      title: React.ReactNode;
      description?: React.ReactNode;
      size?: string;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'empty-state' },
        React.createElement('div', null, title),
        description && React.createElement('div', null, description)
      ),
    AlertDialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) =>
      open
        ? React.createElement(
            'div',
            {
              role: 'dialog',
              'aria-modal': 'true',
              onClick: (e: React.MouseEvent) => {
                if (e.target === e.currentTarget) onOpenChange(false);
              },
            },
            children
          )
        : null,
    AlertDialogContent: ({ children }: { children: React.ReactNode; size?: string }) =>
      React.createElement('div', { 'data-testid': 'alert-dialog-content' }, children),
    AlertDialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h3', null, children),
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    AlertDialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    AlertDialogAction: ({
      children,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      variant?: string;
      onClick?: () => void;
      disabled?: boolean;
    }) => React.createElement('button', { onClick, disabled }, children),
    AlertDialogCancel: ({ children }: { children: React.ReactNode }) =>
      React.createElement('button', null, children),
    Collapsible: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'collapsible', 'data-open': open, onClick: () => onOpenChange(!open) },
        children
      ),
    CollapsibleTrigger: ({
      children,
      asChild,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    }) => (asChild ? children : React.createElement('button', null, children)),
    CollapsibleContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'collapsible-content' }, children),
    Sheet: ({
      children,
      open,
      onOpenChange,
      title,
      description,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      description?: string;
    }) =>
      open
        ? React.createElement(
            'div',
            { role: 'dialog', 'aria-label': title },
            React.createElement('h2', null, title),
            description && React.createElement('p', null, description),
            React.createElement(
              'button',
              { onClick: () => onOpenChange(false), 'aria-label': 'Close history' },
              'Close'
            ),
            children
          )
        : null,
    cn: (...args: unknown[]) =>
      args
        .filter((a) => typeof a === 'string')
        .join(' ')
        .trim(),
    formatRelativeTime: (dateStr: string) => {
      const diff = Date.now() - new Date(dateStr).getTime();
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return `${minutes}m ago`;
      return `${Math.floor(minutes / 60)}h ago`;
    },
  };
});

import { MemoryRouter } from 'react-router';

import { ChatPanel } from '../chat-components/ChatPanel';
import { useChatPageModel } from '../chat-hooks/useChatPageModel';

function ChatHarness({ historyLayout = 'sidebar' }: { historyLayout?: 'sidebar' | 'drawer' }) {
  const model = useChatPageModel();
  return <ChatPanel model={model} historyLayout={historyLayout} />;
}

function renderHarness(historyLayout: 'sidebar' | 'drawer' = 'sidebar') {
  return render(
    withQueryClient(
      <MemoryRouter>
        <ChatHarness historyLayout={historyLayout} />
      </MemoryRouter>
    )
  );
}

function createControlledResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });

  return {
    response: new Response(body),
    send(frame: Record<string, unknown>) {
      controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(frame) + '\n\n'));
    },
    close() {
      controller.close();
    },
  };
}

// ── Mock data ────────────────────────────────────────────────────────

const mockConversations = [
  {
    id: 'conv_1',
    title: 'Budget discussion',
    activeScopes: ['finance'],
    appContext: null,
    model: 'claude-sonnet-4-20250514',
    createdAt: '2026-04-27T10:00:00Z',
    updatedAt: '2026-04-27T12:00:00Z',
  },
  {
    id: 'conv_2',
    title: 'Movie recommendations',
    activeScopes: ['media'],
    appContext: null,
    model: 'claude-sonnet-4-20250514',
    createdAt: '2026-04-26T08:00:00Z',
    updatedAt: '2026-04-26T09:00:00Z',
  },
];

const mockMessages = [
  {
    id: 'msg_1',
    conversationId: 'conv_1',
    role: 'user',
    content: 'What is my budget?',
    citations: null,
    toolCalls: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: '2026-04-27T12:00:00Z',
  },
  {
    id: 'msg_2',
    conversationId: 'conv_1',
    role: 'assistant',
    content: 'Your budget is **$500**.',
    citations: ['eng_finance_001'],
    toolCalls: null,
    tokensIn: 100,
    tokensOut: 50,
    createdAt: '2026-04-27T12:00:05Z',
  },
];

function setupDefaultMocks() {
  sdk.egoListConversations.mockResolvedValue({
    data: { conversations: mockConversations, total: 2 },
  });
  sdk.egoGetConversation.mockResolvedValue({ data: { conversation: null, messages: [] } });
  sdk.egoDeleteConversation.mockResolvedValue({ data: { success: true } });
}

function setupWithSelectedConversation() {
  sdk.egoListConversations.mockResolvedValue({
    data: { conversations: mockConversations, total: 2 },
  });
  sdk.egoGetConversation.mockImplementation(async ({ path }: { path: { id: string } }) => {
    if (path.id !== 'conv_1') {
      return { data: { conversation: null, messages: [] } };
    }
    return { data: { conversation: mockConversations[0], messages: mockMessages } };
  });
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  streamTestConfig.useRealStream = false;
  vi.clearAllMocks();
  setupDefaultMocks();
});

afterEach(() => vi.unstubAllGlobals());

describe('ChatPanel (overlay-ego)', () => {
  it('renders conversation list with items', async () => {
    renderHarness();
    expect(await screen.findByText('Budget discussion')).toBeInTheDocument();
    expect(screen.getByText('Movie recommendations')).toBeInTheDocument();
  });

  it('shows welcome prompts when no conversation is selected', () => {
    renderHarness();
    expect(screen.getByText('What can I help you with?')).toBeInTheDocument();
  });

  it('fills the composer from a supported starter prompt', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: /Explore my inventory/ }));

    expect(screen.getByLabelText('Message input')).toHaveValue(
      'Help me find an item in my inventory.'
    );
  });

  it('displays messages when a conversation is selected', async () => {
    setupWithSelectedConversation();
    const user = userEvent.setup();
    renderHarness();

    await user.click(await screen.findByText('Budget discussion'));
    expect(await screen.findByText('What is my budget?')).toBeInTheDocument();
  });

  it('renders citation links in assistant messages', async () => {
    setupWithSelectedConversation();
    const user = userEvent.setup();
    renderHarness();

    await user.click(await screen.findByText('Budget discussion'));
    const citationLink = await screen.findByText('eng_finance_001');
    expect(citationLink.closest('a')).toHaveAttribute('href', '/cerebrum/engrams/eng_finance_001');
  });

  it('sends a message via the chat input', async () => {
    const user = userEvent.setup();
    renderHarness();

    const textarea = screen.getByLabelText('Message input');
    await user.type(textarea, 'Hello Ego');

    const sendButton = screen.getByLabelText('Send message');
    await user.click(sendButton);

    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Hello Ego' }),
      expect.any(Object)
    );
  });

  it('Enter key sends message, Shift+Enter inserts newline', async () => {
    const user = userEvent.setup();
    renderHarness();

    const textarea = screen.getByLabelText('Message input');
    await user.type(textarea, 'Line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'Line two');

    expect(mockStream).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('send button is disabled when input is empty', () => {
    renderHarness();
    const sendButton = screen.getByLabelText('Send message');
    expect(sendButton).toBeDisabled();
  });

  it('new conversation button resets selection', async () => {
    setupWithSelectedConversation();
    const user = userEvent.setup();
    renderHarness();

    await user.click(await screen.findByText('Budget discussion'));

    const newButton = screen.getByLabelText('New conversation');
    await user.click(newButton);

    expect(screen.getByText('What can I help you with?')).toBeInTheDocument();
  });

  it('opens conversation history in a drawer and closes it after selection', async () => {
    setupWithSelectedConversation();
    const user = userEvent.setup();
    renderHarness('drawer');

    expect(screen.queryByText('Budget discussion')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conversation history' }));
    expect(await screen.findByRole('dialog', { name: 'Conversations' })).toBeInTheDocument();
    await user.click(screen.getByText('Budget discussion'));

    expect(screen.queryByRole('dialog', { name: 'Conversations' })).not.toBeInTheDocument();
    expect(await screen.findByText('What is my budget?')).toBeInTheDocument();
  });

  it('shows a first-turn prompt and stream tokens before done, then persisted messages', async () => {
    streamTestConfig.useRealStream = true;
    const controlled = createControlledResponse();
    const fetchMock = vi.fn().mockResolvedValue(controlled.response);
    vi.stubGlobal('fetch', fetchMock);
    sdk.egoListConversations.mockResolvedValue({
      data: {
        conversations: [{ ...mockConversations[0], id: 'conv_new', title: 'First turn' }],
        total: 1,
      },
    });
    sdk.egoGetConversation.mockImplementation(async ({ path }: { path: { id: string } }) => ({
      data: {
        conversation: { ...mockConversations[0], id: path.id, title: 'First turn' },
        messages: [
          {
            ...mockMessages[0],
            id: 'persisted_user',
            conversationId: path.id,
            content: 'How many items are in my inventory?',
          },
          {
            ...mockMessages[1],
            id: 'persisted_assistant',
            conversationId: path.id,
            content: 'There are 83 items.',
          },
        ],
      },
    }));
    const user = userEvent.setup();
    renderHarness('drawer');

    await user.type(screen.getByLabelText('Message input'), 'How many items are in my inventory?');
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(screen.getAllByText('How many items are in my inventory?')).toHaveLength(1);
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
    act(() => controlled.send({ type: 'token', text: 'There are ' }));
    expect(await screen.findByText('There are', { exact: false })).toBeInTheDocument();
    act(() => controlled.send({ type: 'token', text: '83 items.' }));
    expect(await screen.findByText('There are 83 items.')).toBeInTheDocument();
    expect(screen.getAllByText('How many items are in my inventory?')).toHaveLength(1);

    act(() => {
      controlled.send({
        type: 'done',
        conversationId: 'conv_new',
        messageId: 'persisted_assistant',
        retrievedEngrams: [],
        parts: [],
      });
      controlled.close();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('streaming-bubble')).not.toBeInTheDocument();
      expect(screen.getAllByText('How many items are in my inventory?')).toHaveLength(1);
      expect(screen.getByText('There are 83 items.')).toBeInTheDocument();
    });
    expect(sdk.egoGetConversation).toHaveBeenCalledWith({ path: { id: 'conv_new' } });
  });

  it('keeps an active reply visible when it repeats an earlier assistant answer', async () => {
    streamTestConfig.useRealStream = true;
    const controlled = createControlledResponse();
    const fetchMock = vi.fn().mockResolvedValue(controlled.response);
    vi.stubGlobal('fetch', fetchMock);
    setupWithSelectedConversation();
    let completed = false;
    const earlierReply = {
      ...mockMessages[1],
      id: 'msg_repeated',
      content: 'That answer is unchanged.',
    };
    const persistedUserMessage = {
      ...mockMessages[0],
      id: 'msg_user_latest',
      content: 'Repeat the previous answer',
    };
    const persistedAssistantMessage = {
      ...mockMessages[1],
      id: 'msg_latest',
      content: 'That answer is unchanged.',
    };
    sdk.egoGetConversation.mockImplementation(async () => ({
      data: {
        conversation: mockConversations[0],
        messages: completed
          ? [...mockMessages, earlierReply, persistedUserMessage, persistedAssistantMessage]
          : [...mockMessages, earlierReply],
      },
    }));
    const user = userEvent.setup();
    renderHarness();

    await user.click(await screen.findByText('Budget discussion'));
    await screen.findByText('What is my budget?');
    await user.type(screen.getByLabelText('Message input'), 'Repeat the previous answer');
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => controlled.send({ type: 'token', text: 'That answer is unchanged.' }));

    expect(await screen.findByTestId('streaming-bubble')).toBeInTheDocument();
    expect(screen.getAllByText('That answer is unchanged.')).toHaveLength(2);

    act(() => {
      completed = true;
      controlled.send({
        type: 'done',
        conversationId: 'conv_1',
        messageId: 'msg_latest',
        retrievedEngrams: [],
        parts: [],
      });
      controlled.close();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('streaming-bubble')).not.toBeInTheDocument();
      expect(screen.getAllByText('That answer is unchanged.')).toHaveLength(2);
    });
  });

  it('keeps a first-turn prompt visible after a stream error', async () => {
    streamTestConfig.useRealStream = true;
    const controlled = createControlledResponse();
    const fetchMock = vi.fn().mockResolvedValue(controlled.response);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderHarness('drawer');

    await user.type(screen.getByLabelText('Message input'), 'Keep this question visible');
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      controlled.send({ type: 'error', message: 'Gateway unavailable' });
      controlled.close();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Gateway unavailable');
    expect(screen.getByText('Keep this question visible')).toBeInTheDocument();
    expect(screen.queryByText('What can I help you with?')).not.toBeInTheDocument();
  });

  it('keeps an existing-turn optimistic message and reports a stream error', async () => {
    streamTestConfig.useRealStream = true;
    const controlled = createControlledResponse();
    const fetchMock = vi.fn().mockResolvedValue(controlled.response);
    vi.stubGlobal('fetch', fetchMock);
    setupWithSelectedConversation();
    const user = userEvent.setup();
    renderHarness('drawer');

    await user.click(screen.getByRole('button', { name: 'Conversation history' }));
    await user.click(await screen.findByText('Budget discussion'));
    await screen.findByText('What is my budget?');
    await user.type(screen.getByLabelText('Message input'), 'Show one more detail');
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('Show one more detail')).toHaveLength(1);

    act(() => {
      controlled.send({ type: 'error', message: 'Gateway unavailable' });
      controlled.close();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Gateway unavailable');
    expect(screen.getAllByText('Show one more detail')).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: expect.stringContaining('"conversationId":"conv_1"'),
    });
  });

  it('shows delete confirmation dialog and calls delete', async () => {
    const user = userEvent.setup();
    renderHarness();

    const firstDeleteButton = await screen.findByLabelText(
      'Delete conversation: Budget discussion'
    );
    await user.click(firstDeleteButton);

    expect(screen.getByText('Delete conversation?')).toBeInTheDocument();

    const confirmButton = screen.getByText('Delete');
    await user.click(confirmButton);

    await waitFor(() =>
      expect(sdk.egoDeleteConversation).toHaveBeenCalledWith({ path: { id: 'conv_1' } })
    );
  });

  it('search input filters conversations', async () => {
    const user = userEvent.setup();
    renderHarness();

    const searchInput = screen.getByLabelText('Search conversations');
    await user.type(searchInput, 'budget');

    await waitFor(() =>
      expect(sdk.egoListConversations).toHaveBeenCalledWith({
        body: expect.objectContaining({ search: 'budget' }),
      })
    );
  });

  it('shows loading skeletons when conversations are loading', () => {
    sdk.egoListConversations.mockReturnValue(new Promise(() => undefined));
    renderHarness();
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the chat panel layout', () => {
    renderHarness();

    expect(screen.getByLabelText('Message input')).toBeInTheDocument();
  });

  it('shows empty search message when no conversations match', async () => {
    sdk.egoListConversations.mockResolvedValue({ data: { conversations: [], total: 0 } });
    renderHarness();
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument();
  });
});

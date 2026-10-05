/**
 * MessageThread — renders the list of messages for the selected conversation.
 *
 * User messages are right-aligned, assistant messages left-aligned.
 * Assistant messages render Markdown and display citation links.
 */
import { Bot, User } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { cn, Skeleton } from '@pops/ui';

import { AssistantMarkdown } from './AssistantMarkdown';
import { CitationLink } from './CitationLink';
import { MessageParts } from './MessageParts';
import { StreamingBubble } from './StreamingBubble';
import { TypingIndicator } from './TypingIndicator';

import type { MessagePart } from '../chat-hooks/message-parts';
import type { ChatMessage, ToolActivity } from '../chat-hooks/types';
import type { BatchDecisionApi } from '../chat-hooks/useBatchDecision';

const EMPTY_TOOLS: ToolActivity[] = [];
const EMPTY_PARTS: MessagePart[] = [];

export interface MessageThreadProps {
  /** Messages to display. */
  messages: ChatMessage[];
  /** Whether messages are currently loading. */
  isLoading: boolean;
  /** Whether a new message is being sent (shows typing indicator). */
  isSending: boolean;
  /** Partial streaming content from the assistant (null when not streaming). */
  streamingContent?: string | null;
  /** Tool activity from the active assistant stream. */
  toolActivity?: ToolActivity[];
  /** Rich content parts from the active assistant stream. */
  streamParts?: MessagePart[];
  /** Batch decision controls for persisted assistant action parts. */
  decisions?: BatchDecisionApi | null;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

/** Render a single message bubble. */
function MessageContent({
  message,
  decisions,
}: {
  message: ChatMessage;
  decisions: BatchDecisionApi | null;
}) {
  if (message.role === 'user') {
    return <p className="whitespace-pre-wrap text-sm">{message.content}</p>;
  }
  if (message.parts && message.parts.length > 0) {
    return <MessageParts decisions={decisions} parts={message.parts} />;
  }
  return <AssistantMarkdown>{message.content}</AssistantMarkdown>;
}

function MessageBubble({
  message,
  decisions,
}: {
  message: ChatMessage;
  decisions: BatchDecisionApi | null;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary/10 text-primary' : 'bg-app-accent/10 text-app-accent'
        )}
        aria-hidden
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground'
        )}
      >
        <MessageContent decisions={decisions} message={message} />
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/30 pt-2">
            {message.citations.map((engramId) => (
              <CitationLink key={engramId} engramId={engramId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function mergeStreamActionUpdates(messages: ChatMessage[], streamParts: MessagePart[]) {
  const streamedActions = new Map<string, Extract<MessagePart, { type: 'actions' }>>();
  streamParts.forEach((part) => {
    if (part.type === 'actions') streamedActions.set(part.batchId, part);
  });

  const persistedBatchIds = new Set<string>();
  messages.forEach((message) => {
    message.parts?.forEach((part) => {
      if (part.type === 'actions') persistedBatchIds.add(part.batchId);
    });
  });

  return {
    visibleMessages: messages.map((message) => ({
      ...message,
      parts:
        message.parts?.map((part) =>
          part.type === 'actions' ? (streamedActions.get(part.batchId) ?? part) : part
        ) ?? null,
    })),
    newStreamParts: streamParts.filter(
      (part) => part.type !== 'actions' || !persistedBatchIds.has(part.batchId)
    ),
  };
}

function shouldShowStreamingBubble(
  isStreaming: boolean,
  content: string,
  toolActivity: ToolActivity[],
  streamParts: MessagePart[]
) {
  return isStreaming && (content.length > 0 || toolActivity.length > 0 || streamParts.length > 0);
}

export function MessageThread({
  messages,
  isLoading,
  isSending,
  streamingContent,
  toolActivity = EMPTY_TOOLS,
  streamParts = EMPTY_PARTS,
  decisions = null,
  className,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = streamingContent !== null && streamingContent !== undefined;
  const streamContent = streamingContent ?? '';
  const { visibleMessages, newStreamParts } = mergeStreamActionUpdates(messages, streamParts);
  const showStreamingBubble = shouldShowStreamingBubble(
    isStreaming,
    streamContent,
    toolActivity,
    streamParts
  );

  // Auto-scroll when persisted or streamed content and activity change.
  useEffect(() => {
    if (
      messages.length === 0 &&
      !isSending &&
      (streamingContent === null || streamingContent === undefined) &&
      toolActivity.length === 0 &&
      streamParts.length === 0
    ) {
      return;
    }
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, streamingContent, toolActivity, streamParts]);

  if (isLoading) {
    return (
      <div className={cn('flex-1 space-y-4 overflow-y-auto p-4', className)}>
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="ml-auto h-12 w-2/3" />
        <Skeleton className="h-20 w-3/4" />
      </div>
    );
  }

  return (
    <div className={cn('flex-1 space-y-4 overflow-y-auto p-4', className)}>
      {visibleMessages.map((message) => (
        <MessageBubble key={message.id} decisions={decisions} message={message} />
      ))}
      {showStreamingBubble && (
        <StreamingBubble content={streamContent} parts={newStreamParts} tools={toolActivity} />
      )}
      {isSending && !showStreamingBubble && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

import { useEffect, useRef } from 'react';

import { ThreadContent } from './MessageThread.content';
import { mergeStreamActionUpdates, shouldShowStreamingBubble } from './MessageThread.stream';

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
  /** Persisted assistant message id for the active stream, when available. */
  persistedMessageId?: string | null;
  /** First-turn prompt shown until the new conversation is persisted and fetched. */
  pendingUserMessage?: string | null;
  /** Tool activity from the active assistant stream. */
  toolActivity?: ToolActivity[];
  /** Rich content parts from the active assistant stream. */
  streamParts?: MessagePart[];
  /** Batch decision controls for persisted assistant action parts. */
  decisions?: BatchDecisionApi | null;
  /** Use the tighter bubble layout shown in the floating overlay. */
  compact?: boolean;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

interface PresentationParams {
  messages: ChatMessage[];
  streamingContent: string | null | undefined;
  persistedMessageId: string | null;
  pendingUserMessage: string | null;
  toolActivity: ToolActivity[];
  streamParts: MessagePart[];
  isSending: boolean;
}

function createPendingMessage(content: string): ChatMessage {
  return {
    id: 'pending-user-message',
    conversationId: '',
    role: 'user',
    content,
    citations: null,
    parts: null,
    createdAt: '',
  };
}

function getPendingMessage(messages: ChatMessage[], content: string | null) {
  if (
    content === null ||
    messages.some((message) => message.role === 'user' && message.content === content)
  ) {
    return null;
  }
  return createPendingMessage(content);
}

function getThreadPresentation({
  messages,
  streamingContent,
  persistedMessageId,
  pendingUserMessage,
  toolActivity,
  streamParts,
  isSending,
}: PresentationParams) {
  const { visibleMessages, newStreamParts } = mergeStreamActionUpdates(
    messages,
    streamParts,
    persistedMessageId
  );
  const streamAlreadyPersisted =
    persistedMessageId !== null && messages.some((message) => message.id === persistedMessageId);
  const streamContent = streamingContent ?? '';
  const isStreaming = streamingContent !== null && streamingContent !== undefined;
  const showStreamingBubble =
    !streamAlreadyPersisted &&
    shouldShowStreamingBubble(isStreaming, streamContent, toolActivity, newStreamParts);

  return {
    visibleMessages,
    pendingMessage: getPendingMessage(messages, pendingUserMessage),
    streamContent,
    newStreamParts,
    showStreamingBubble,
    showTyping: isSending && !showStreamingBubble && !streamAlreadyPersisted,
  };
}

function useThreadAutoScroll({
  messages,
  pendingUserMessage,
  isSending,
  streamingContent,
  toolActivity,
  streamParts,
}: PresentationParams) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasContent =
      messages.length > 0 ||
      pendingUserMessage !== null ||
      isSending ||
      (streamingContent !== null && streamingContent !== undefined) ||
      toolActivity.length > 0 ||
      streamParts.length > 0;
    if (hasContent) bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, pendingUserMessage, isSending, streamingContent, toolActivity, streamParts]);

  return bottomRef;
}

/** Render persisted messages alongside the active stream and pending first prompt. */
export function MessageThread({
  messages,
  isLoading,
  isSending,
  streamingContent,
  persistedMessageId = null,
  pendingUserMessage = null,
  toolActivity = EMPTY_TOOLS,
  streamParts = EMPTY_PARTS,
  decisions = null,
  compact = false,
  className,
}: MessageThreadProps) {
  const presentationParams = {
    messages,
    streamingContent,
    persistedMessageId,
    pendingUserMessage,
    toolActivity,
    streamParts,
    isSending,
  };
  const bottomRef = useThreadAutoScroll(presentationParams);
  const presentation = getThreadPresentation(presentationParams);

  return (
    <ThreadContent
      visibleMessages={presentation.visibleMessages}
      pendingMessage={presentation.pendingMessage}
      decisions={decisions}
      compact={compact}
      isLoading={isLoading}
      streamContent={presentation.streamContent}
      newStreamParts={presentation.newStreamParts}
      toolActivity={toolActivity}
      showStreamingBubble={presentation.showStreamingBubble}
      showTyping={presentation.showTyping}
      className={className}
      bottomRef={bottomRef}
    />
  );
}

import type { MessagePart } from '../chat-hooks/message-parts';
import type { ChatMessage, ToolActivity } from '../chat-hooks/types';

export function mergeStreamActionUpdates(
  messages: ChatMessage[],
  streamParts: MessagePart[],
  persistedMessageId: string | null
) {
  const streamedActions = new Map<string, Extract<MessagePart, { type: 'actions' }>>();
  streamParts.forEach((part) => {
    if (part.type === 'actions') streamedActions.set(part.batchId, part);
  });

  const persistedBatchIds = new Set<string>();
  const persistedPartKeys = new Set(
    messages
      .find((message) => message.id === persistedMessageId)
      ?.parts?.filter((part) => part.type !== 'actions')
      .map((part) => JSON.stringify(part)) ?? []
  );
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
    newStreamParts: streamParts.filter((part) => {
      if (part.type === 'actions') return !persistedBatchIds.has(part.batchId);
      return !persistedPartKeys.has(JSON.stringify(part));
    }),
  };
}

export function shouldShowStreamingBubble(
  isStreaming: boolean,
  content: string,
  toolActivity: ToolActivity[],
  streamParts: MessagePart[]
) {
  return isStreaming && (content.length > 0 || toolActivity.length > 0 || streamParts.length > 0);
}

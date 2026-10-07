import { Skeleton, cn } from '@pops/ui';

import { MessageBubble } from './MessageThread.bubble';
import { StreamingBubble } from './StreamingBubble';
import { TypingIndicator } from './TypingIndicator';

import type { RefObject } from 'react';

import type { MessagePart } from '../chat-hooks/message-parts';
import type { ChatMessage, ToolActivity } from '../chat-hooks/types';
import type { BatchDecisionApi } from '../chat-hooks/useBatchDecision';

interface ThreadContentProps {
  visibleMessages: ChatMessage[];
  pendingMessage: ChatMessage | null;
  decisions: BatchDecisionApi | null;
  compact: boolean;
  isLoading: boolean;
  streamContent: string;
  newStreamParts: MessagePart[];
  toolActivity: ToolActivity[];
  showStreamingBubble: boolean;
  showTyping: boolean;
  className?: string;
  bottomRef: RefObject<HTMLDivElement | null>;
}

function MessageList({
  visibleMessages,
  pendingMessage,
  decisions,
  compact,
  streamContent,
  newStreamParts,
  toolActivity,
  showStreamingBubble,
  showTyping,
}: Omit<ThreadContentProps, 'isLoading' | 'className' | 'bottomRef'>) {
  return (
    <>
      {visibleMessages.map((message) => (
        <MessageBubble key={message.id} compact={compact} decisions={decisions} message={message} />
      ))}
      {pendingMessage !== null && (
        <MessageBubble compact={compact} decisions={decisions} message={pendingMessage} />
      )}
      {showStreamingBubble && (
        <StreamingBubble
          compact={compact}
          content={streamContent}
          parts={newStreamParts}
          tools={toolActivity}
        />
      )}
      {showTyping && <TypingIndicator compact={compact} />}
    </>
  );
}

export function ThreadContent({
  visibleMessages,
  pendingMessage,
  decisions,
  compact,
  isLoading,
  streamContent,
  newStreamParts,
  toolActivity,
  showStreamingBubble,
  showTyping,
  className,
  bottomRef,
}: ThreadContentProps) {
  const layout = compact
    ? 'min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 md:p-5'
    : 'flex-1 space-y-4 overflow-y-auto p-4';

  if (isLoading) {
    return (
      <div className={cn(layout, className)}>
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="ml-auto h-12 w-2/3" />
        <Skeleton className="h-20 w-3/4" />
      </div>
    );
  }

  return (
    <div className={cn(layout, className)}>
      <MessageList
        visibleMessages={visibleMessages}
        pendingMessage={pendingMessage}
        decisions={decisions}
        compact={compact}
        streamContent={streamContent}
        newStreamParts={newStreamParts}
        toolActivity={toolActivity}
        showStreamingBubble={showStreamingBubble}
        showTyping={showTyping}
      />
      <div ref={bottomRef} />
    </div>
  );
}

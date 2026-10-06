import { Bot, User } from 'lucide-react';

import { cn } from '@pops/ui';

import { AssistantMarkdown } from './AssistantMarkdown';
import { CitationLink } from './CitationLink';
import { MessageParts } from './MessageParts';

import type { ChatMessage } from '../chat-hooks/types';
import type { BatchDecisionApi } from '../chat-hooks/useBatchDecision';

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

function rowClassName(compact: boolean, isUser: boolean) {
  if (compact && isUser) return 'flex min-w-0 justify-end';
  if (compact) return 'flex min-w-0 justify-start';
  if (isUser) return 'flex flex-row-reverse gap-3';
  return 'flex flex-row gap-3';
}

function bubbleClassName(compact: boolean, isUser: boolean) {
  const layout = compact
    ? 'w-fit max-w-full rounded-2xl px-4 py-3 shadow-sm'
    : 'max-w-[80%] rounded-lg px-4 py-3';
  let corner = '';
  if (compact && isUser) corner = 'rounded-br-md';
  if (compact && !isUser) corner = 'rounded-bl-md';
  const tone = isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground';
  return cn(layout, corner, tone);
}

/** Render one persisted or optimistic Ego message. */
export function MessageBubble({
  message,
  decisions,
  compact,
}: {
  message: ChatMessage;
  decisions: BatchDecisionApi | null;
  compact: boolean;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={rowClassName(compact, isUser)}>
      {!compact && (
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isUser ? 'bg-primary/10 text-primary' : 'bg-app-accent/10 text-app-accent'
          )}
          aria-hidden
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
      )}
      <div className={bubbleClassName(compact, isUser)}>
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

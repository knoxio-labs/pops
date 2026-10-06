import { Bot } from 'lucide-react';

import { cn } from '@pops/ui';

/** Announces that the assistant is preparing a response before visible stream output. */
export function TypingIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-label="Waiting for assistant response"
      className={compact ? 'flex justify-start' : 'flex gap-3'}
      data-testid="typing-indicator"
      role="status"
    >
      {!compact && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/10 text-app-accent">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          'flex items-center gap-1 bg-muted/50 px-4 py-3',
          compact ? 'rounded-2xl rounded-bl-md' : 'rounded-lg'
        )}
      >
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

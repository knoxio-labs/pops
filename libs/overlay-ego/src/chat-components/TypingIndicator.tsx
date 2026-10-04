import { Bot } from 'lucide-react';

/** Announces that the assistant is preparing a response before visible stream output. */
export function TypingIndicator() {
  return (
    <div
      aria-label="Waiting for assistant response"
      className="flex gap-3"
      data-testid="typing-indicator"
      role="status"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/10 text-app-accent">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

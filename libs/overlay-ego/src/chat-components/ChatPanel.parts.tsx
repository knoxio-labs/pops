import { History, MessageSquarePlus } from 'lucide-react';

import { Button } from '@pops/ui';

import { ChatInput } from './ChatInput';
import { ContextIndicator } from './ContextIndicator';

import type { ChatPageModel } from '../chat-hooks/types';

export function ThreadHeader({
  title,
  onOpenHistory,
  onNew,
}: {
  title: string;
  onOpenHistory: () => void;
  onNew: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onOpenHistory}
        aria-label="Conversation history"
        className="min-h-11 min-w-11 rounded-xl"
      >
        <History className="size-5" aria-hidden />
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">Your POPS assistant</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onNew}
        aria-label="New conversation"
        className="min-h-11 min-w-11 rounded-xl"
      >
        <MessageSquarePlus className="size-5" aria-hidden />
      </Button>
    </header>
  );
}

export function ThreadFeedback({ model }: { model: ChatPageModel }) {
  return (
    <div className="px-4">
      <div className="mx-auto max-w-3xl space-y-2">
        <ContextIndicator
          activeScopes={model.activeScopes}
          contextEngrams={model.retrievedEngrams}
        />
        {model.sendError && (
          <div
            className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {model.sendError}
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreadComposer({ model, compact }: { model: ChatPageModel; compact: boolean }) {
  return (
    <div className="border-t border-border/50 px-4 pb-4 pt-3">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border/60 bg-card p-1.5 shadow-sm">
        <ChatInput
          value={model.inputValue}
          onChange={model.setInputValue}
          onSend={model.sendMessage}
          isSending={model.isSending}
          compact={compact}
        />
      </div>
    </div>
  );
}

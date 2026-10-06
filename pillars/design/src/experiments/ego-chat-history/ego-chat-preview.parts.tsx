import { egoChatFixture } from '@/fixtures/cerebrum/ego-chat';
import {
  ArrowLeft,
  Clock3,
  MessageSquareText,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
} from 'lucide-react';

import { Badge, Button, Card, TextInput, Textarea } from '@pops/ui';

type ThreadState = 'empty' | 'streaming' | 'error';

function ChatHeader({ onHistory, onNew }: { onHistory: () => void; onNew: () => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Ego</p>
        <p className="text-xs text-muted-foreground">Your personal assistant</p>
      </div>
      <Button variant="ghost" size="icon" aria-label="New chat" onClick={onNew}>
        <Plus className="size-4" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Conversation history" onClick={onHistory}>
        <Clock3 className="size-4" aria-hidden />
      </Button>
    </header>
  );
}

function Composer() {
  return (
    <div className="shrink-0 space-y-2 border-t p-4">
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Message Ego"
          placeholder="Ask Ego anything…"
          rows={1}
          className="min-h-11 max-h-28 resize-none"
        />
        <Button size="icon" aria-label="Send message">
          <SendHorizontal className="size-4" aria-hidden />
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Ego can make mistakes. Check important details.
      </p>
    </div>
  );
}

function ConversationList({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="space-y-4">
      <TextInput
        aria-label="Search conversations"
        placeholder="Search conversations"
        prefix={<Search className="size-4" aria-hidden />}
      />
      <div className="space-y-2">
        {egoChatFixture.conversations.map((conversation, index) => (
          <Button
            key={conversation.id}
            variant="ghost"
            className="h-auto w-full justify-start px-3 py-3 text-left"
            onClick={onSelect}
          >
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="flex w-full items-center gap-2">
                <MessageSquareText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 truncate font-medium">{conversation.title}</span>
                {index === 0 && <Badge variant="secondary">Open</Badge>}
              </span>
              <span className="w-full truncate pl-6 text-xs text-muted-foreground">
                {conversation.preview}
              </span>
              <span className="pl-6 text-xs text-muted-foreground">{conversation.updatedAt}</span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function HistoryPage({
  onBack,
  onNew,
  onSelect,
}: {
  onBack: () => void;
  onNew: () => void;
  onSelect: () => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="icon" aria-label="Back to chat" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h2 className="text-base font-semibold">Your conversations</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ConversationList onSelect={onSelect} />
      </div>
      <Button
        variant="outline"
        className="m-4 mt-0"
        onClick={onNew}
        prefix={<Plus className="size-4" aria-hidden />}
      >
        New conversation
      </Button>
    </section>
  );
}

function Thread({ state }: { state: ThreadState }) {
  if (state === 'empty') {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto p-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-6" aria-hidden />
          </div>
          <h2 className="text-xl font-semibold">What can I help with?</h2>
          <p className="text-sm text-muted-foreground">
            Ask a question or choose a place to start.
          </p>
        </div>
        <div className="space-y-2">
          {egoChatFixture.suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left"
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <div className="flex justify-end">
        <div className="max-w-sm rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
          {egoChatFixture.prompt}
        </div>
      </div>
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <Card className="max-w-md gap-2 p-4">
          <p className="text-sm leading-relaxed">
            {state === 'streaming' ? egoChatFixture.partialResponse : egoChatFixture.response}
          </p>
          {state === 'streaming' && <Badge variant="outline">Ego is replying</Badge>}
          {state === 'error' && (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>I couldn’t finish that reply. Your message is still here.</p>
              <Button variant="outline" size="sm">
                Try again
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Shared visual pieces for the Ego history layout experiment. */
export const egoChatPreviewParts = {
  ChatHeader,
  Composer,
  ConversationList,
  HistoryPage,
  Thread,
};

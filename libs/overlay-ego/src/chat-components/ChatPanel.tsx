/**
 * ChatPanel — composes conversation history, the thread, and the composer.
 *
 * The full page keeps its history sidebar. The shell overlay opens history in
 * a modal sheet so the thread keeps the full width of the narrow panel.
 */
import { useState } from 'react';

import { Sheet, cn } from '@pops/ui';

import { ThreadComposer, ThreadFeedback, ThreadHeader } from './ChatPanel.parts';
import { ChatWelcome } from './ChatWelcome';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';

import type { ChatPageModel } from '../chat-hooks/types';

export interface ChatPanelProps {
  /** The chat page view model. */
  model: ChatPageModel;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
  /** Use a modal history sheet instead of a persistent sidebar. */
  historyLayout?: 'sidebar' | 'drawer';
}

function shouldShowWelcome(model: ChatPageModel) {
  return (
    model.selectedConversationId === null &&
    model.messages.length === 0 &&
    model.pendingUserMessage === null &&
    !model.isSending &&
    model.streamingContent === null
  );
}

function ThreadConversation({ model, compact }: { model: ChatPageModel; compact: boolean }) {
  if (shouldShowWelcome(model)) return <ChatWelcome onPrompt={model.setInputValue} />;

  return (
    <MessageThread
      messages={model.messages}
      pendingUserMessage={model.pendingUserMessage}
      isLoading={
        model.messagesLoading &&
        model.selectedConversationId !== null &&
        model.pendingUserMessage === null &&
        !model.isSending
      }
      isSending={model.isSending}
      streamParts={model.streamParts}
      streamingContent={model.streamingContent}
      persistedMessageId={model.persistedMessageId}
      toolActivity={model.toolActivity}
      decisions={model.batchDecisions}
      compact={compact}
    />
  );
}

function ThreadArea({
  model,
  historyLayout,
  onOpenHistory,
}: {
  model: ChatPageModel;
  historyLayout: 'sidebar' | 'drawer';
  onOpenHistory: () => void;
}) {
  const compact = historyLayout === 'drawer';
  const selectedConversation = model.conversations.find(
    (conversation) => conversation.id === model.selectedConversationId
  );
  const title =
    model.selectedConversationId === null
      ? 'New conversation'
      : (selectedConversation?.title ?? 'Conversation');

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      {compact && (
        <ThreadHeader
          title={title}
          onOpenHistory={onOpenHistory}
          onNew={model.startNewConversation}
        />
      )}
      <ThreadConversation model={model} compact={compact} />
      <ThreadFeedback model={model} />
      <ThreadComposer model={model} compact={compact} />
    </div>
  );
}

function ConversationListForModel({
  model,
  className,
  onSelect,
  onNew,
}: {
  model: ChatPageModel;
  className?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <ConversationList
      conversations={model.conversations}
      isLoading={model.conversationsLoading}
      selectedId={model.selectedConversationId}
      onSelect={onSelect}
      onNew={onNew}
      onDelete={model.deleteConversation}
      isDeleting={model.isDeleting}
      searchQuery={model.searchQuery}
      onSearchChange={model.setSearchQuery}
      className={className}
    />
  );
}

/** Render Ego chat with persistent sidebar history or a modal history drawer. */
export function ChatPanel({ model, className, historyLayout = 'sidebar' }: ChatPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (historyLayout === 'drawer') {
    return (
      <div
        className={cn(
          'relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/50',
          className
        )}
      >
        <ThreadArea
          model={model}
          historyLayout="drawer"
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <Sheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          title="Conversations"
          description="Open a conversation or start a new one."
        >
          <ConversationListForModel
            model={model}
            className="min-h-0 flex-1"
            onSelect={(id) => {
              model.selectConversation(id);
              setHistoryOpen(false);
            }}
            onNew={() => {
              model.startNewConversation();
              setHistoryOpen(false);
            }}
          />
        </Sheet>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full min-w-0 overflow-hidden rounded-lg border border-border/50',
        className
      )}
    >
      <div className="w-72 shrink-0 border-r border-border/50 bg-card">
        <ConversationListForModel
          model={model}
          onSelect={model.selectConversation}
          onNew={model.startNewConversation}
        />
      </div>
      <ThreadArea model={model} historyLayout="sidebar" onOpenHistory={() => undefined} />
    </div>
  );
}

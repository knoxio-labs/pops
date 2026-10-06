import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, SheetPanel } from '@pops/ui';

import { egoChatPreviewParts } from './ego-chat-preview.parts';
import { WorkspaceBackdrop } from './workspace-backdrop';

import type { ScreenStates } from '@/contract';

const { ChatHeader, Composer, ConversationList, HistoryPage, Thread } = egoChatPreviewParts;

type HistoryPresentation = 'sheet' | 'takeover';
type ChatState = 'empty' | 'history' | 'streaming' | 'error';

/** Renders the compact Ego chat with a sheet or takeover history layout. */
export function EgoCompactChat({
  presentation = 'sheet',
  initialState = 'empty',
}: {
  presentation?: HistoryPresentation;
  initialState?: ChatState;
}) {
  const [state, setState] = useState<ChatState>(initialState);
  const [stateBeforeHistory, setStateBeforeHistory] = useState<Exclude<ChatState, 'history'>>(
    initialState === 'history' ? 'streaming' : initialState
  );
  const onHistory = () => {
    setStateBeforeHistory(state === 'history' ? 'empty' : state);
    setState('history');
  };
  const onNew = () => setState('empty');
  const onBack = () => setState(stateBeforeHistory);
  const onSelect = () => setState('streaming');
  const threadState = state === 'history' ? 'streaming' : state;

  return (
    <main className="relative min-h-svh overflow-hidden bg-muted/30">
      <WorkspaceBackdrop />
      <aside
        aria-label="Ego chat"
        className="fixed top-20 right-0 bottom-0 z-20 flex w-full max-w-lg flex-col border-l bg-background shadow-xl"
      >
        <ChatHeader onHistory={onHistory} onNew={onNew} />
        {state === 'history' && presentation === 'takeover' ? (
          <HistoryPage onBack={onBack} onNew={onNew} onSelect={onSelect} />
        ) : (
          <>
            <Thread state={threadState} />
            <Composer />
          </>
        )}
      </aside>
      {state === 'history' && presentation === 'sheet' && (
        <SheetPanel
          title="Your conversations"
          description="Pick up where you left off."
          onClose={onBack}
          className="fixed top-20 right-0 bottom-0 z-30 w-full max-w-lg rounded-none border-y-0 shadow-2xl md:right-128 md:w-120 md:rounded-l-xl"
        >
          <ConversationList onSelect={onSelect} />
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={onNew}
            prefix={<Plus className="size-4" aria-hidden />}
          >
            New conversation
          </Button>
        </SheetPanel>
      )}
    </main>
  );
}

/** Creates matching empty, history, streaming, and error states for each variant. */
export function createEgoChatStates(presentation: HistoryPresentation): ScreenStates {
  return {
    empty: () => <EgoCompactChat presentation={presentation} initialState="empty" />,
    history: () => <EgoCompactChat presentation={presentation} initialState="history" />,
    streaming: () => <EgoCompactChat presentation={presentation} initialState="streaming" />,
    error: () => <EgoCompactChat presentation={presentation} initialState="error" />,
  };
}

import { Button, Textarea } from '@pops/ui';

import type { JSX } from 'react';

import type { CaptureComposerProps } from './composer-types';

/** Existing composer state and its single submitted command, independent of presentation. */
export type CaptureComposerControlProps = CaptureComposerProps & { onSubmit: () => void };

/** Edit the retained verbatim draft; keyboard submission uses the same guarded capture action. */
export function CaptureComposerInput(props: CaptureComposerControlProps): JSX.Element {
  const { session, state, view, compact, onSubmit } = props;
  return (
    <Textarea
      aria-label={view === 'explore' ? 'Save possibility' : 'Capture text'}
      placeholder={composerPlaceholder(view, compact)}
      rows={compact ? 1 : undefined}
      className={compact ? 'min-h-11 resize-y' : undefined}
      value={state.draft.originalText}
      disabled={state.composerLocked}
      onChange={(event) => session.editor.editDraft({ originalText: event.target.value })}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          onSubmit();
        }
      }}
    />
  );
}

/** Capture and clearing retain the original busy, draft and Undo locks. */
export function CaptureComposerActions({
  session,
  state,
  view,
  onSubmit,
}: CaptureComposerControlProps): JSX.Element {
  const hasSource =
    state.draft.originalText.trim() ||
    state.draft.originalUrl.trim() ||
    state.draft.selections.length > 0;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <Button
        variant="ghost"
        disabled={state.composerLocked}
        onClick={() => session.editor.clearDraft()}
      >
        Clear
      </Button>
      <Button disabled={state.busy || state.composerLocked || !hasSource} onClick={onSubmit}>
        {view === 'explore' ? 'Save' : 'Capture'}
      </Button>
    </div>
  );
}

function composerPlaceholder(
  view: CaptureComposerProps['view'],
  compact: boolean | undefined
): string {
  if (view === 'explore') return 'Save a possibility…';
  if (compact) return 'Paste a confirmation, a link or a thought. The original is kept.';
  return 'Paste or type anything…';
}

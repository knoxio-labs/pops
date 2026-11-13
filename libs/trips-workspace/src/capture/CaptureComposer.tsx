import { CaptureComposerFiles, CaptureComposerSelections } from './CaptureComposerAttachments';
import { CaptureComposerActions, CaptureComposerInput } from './CaptureComposerControls';
import { CaptureDetails } from './CaptureDetails';

import type { JSX } from 'react';

import type { CaptureComposerControlProps } from './CaptureComposerControls';
import type { CaptureComposerProps } from './composer-types';

/** Text-first composer shared by all approved source surfaces; optional fields stay explicit. */
export function CaptureComposer(props: CaptureComposerProps): JSX.Element {
  const { session, state, view } = props;
  const onSubmit = (): void => {
    if (state.busy || state.composerLocked) return;
    session.editor.editDraft({ explore: view === 'explore' });
    void session.editor.capture();
  };
  if (props.compact) return <CompactComposer {...props} onSubmit={onSubmit} />;
  return (
    <section
      aria-label="Capture composer"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <CaptureComposerInput {...props} onSubmit={onSubmit} />
      <CaptureDetails {...props} />
      <CaptureComposerFiles {...props} />
      <CaptureComposerSelections {...props} />
      <CaptureComposerActions {...props} onSubmit={onSubmit} />
    </section>
  );
}

function CompactComposer(props: CaptureComposerControlProps): JSX.Element {
  return (
    <section aria-label="Capture composer" className="space-y-2">
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <CaptureComposerInput {...props} />
        </div>
        <CaptureComposerFiles {...props} />
        <CaptureComposerActions {...props} />
      </div>
      <CaptureComposerSelections {...props} />
      <CaptureDetails {...props} />
    </section>
  );
}

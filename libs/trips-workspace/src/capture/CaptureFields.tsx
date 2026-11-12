import { useSyncExternalStore } from 'react';

import { Button, Select, Textarea, TextInput } from '@pops/ui';

import { captureClassifications } from './choices';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { Capture } from './types';

/** Inline capture edits retain their exact source revision and never replace immutable raw material. */

export function CaptureFields({
  session,
  capture,
  busy,
  expanded,
}: {
  session: CaptureBrowserSession;
  capture: Capture;
  busy: boolean;
  expanded?: boolean;
}): JSX.Element {
  useSyncExternalStore(
    session.records.subscribe,
    session.records.getVersion,
    session.records.getVersion
  );
  const draft = session.records.capture(capture.id);
  return (
    <details open={expanded}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Edit capture</summary>
      <div className="space-y-3">
        <TextInput
          label="Capture title"
          value={
            draft?.input.title === undefined ? (capture.title ?? '') : (draft.input.title ?? '')
          }
          disabled={busy}
          onChange={(event) =>
            session.records.editCapture(capture, { title: event.target.value || null })
          }
          onBlur={() => void session.records.saveCapture(capture.id)}
        />
        <Textarea
          aria-label="Capture notes"
          value={draft?.input.notes ?? capture.notes}
          disabled={busy}
          onChange={(event) => session.records.editCapture(capture, { notes: event.target.value })}
          onBlur={() => void session.records.saveCapture(capture.id)}
        />
        <ClassificationField
          session={session}
          capture={capture}
          busy={busy}
          value={
            draft?.input.classification === undefined
              ? capture.classification
              : draft.input.classification
          }
        />
        {draft ? <DiscardCaptureEdits session={session} id={capture.id} /> : null}
      </div>
    </details>
  );
}

function ClassificationField({
  session,
  capture,
  busy,
  value,
}: {
  session: CaptureBrowserSession;
  capture: Capture;
  busy: boolean;
  value: Capture['classification'];
}): JSX.Element {
  return (
    <Select
      label="Capture classification"
      value={value ?? ''}
      disabled={busy}
      options={[
        { value: '', label: 'Unclassified' },
        ...captureClassifications.map((value) => ({ value, label: value })),
      ]}
      onChange={(event) => {
        session.records.editCapture(capture, {
          classification:
            captureClassifications.find((value) => value === event.target.value) ?? null,
        });
        void session.records.saveCapture(capture.id);
      }}
    />
  );
}

function DiscardCaptureEdits({
  session,
  id,
}: {
  session: CaptureBrowserSession;
  id: number;
}): JSX.Element {
  return (
    <Button
      variant="ghost"
      disabled={!session.editor.canDiscardRejectedEdit('capture', id)}
      onClick={() => session.records.discard('capture', id)}
    >
      Discard unsaved capture edits
    </Button>
  );
}

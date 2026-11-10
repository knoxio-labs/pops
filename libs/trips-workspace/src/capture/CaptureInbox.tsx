import { useEffect, useState, useSyncExternalStore } from 'react';

import { Button, Select } from '@pops/ui';

import { CaptureAttachments } from './CaptureAttachments';
import { CaptureFields } from './CaptureFields';
import { CaptureOrganise } from './CaptureOrganise';
import { captureOrganisation } from './inbox-model';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { Capture, CaptureSource, CaptureWorkspaceProps } from './types';

/** Inline source inbox keeps raw material visible while editing only explicitly selected fields. */
export function CaptureInbox({
  session,
  documentsClient,
}: {
  session: CaptureBrowserSession;
  documentsClient?: CaptureWorkspaceProps['documentsClient'];
}): JSX.Element {
  const state = useSyncExternalStore(
    session.editor.subscribe,
    session.editor.getState,
    session.editor.getState
  );
  const [filter, setFilter] = useState('all');
  useInboxContactReads(session, state.source);
  const captures = state.source.captures.filter(
    (row) =>
      row.removedAt === null &&
      (filter === 'all' ||
        captureOrganisation(row, state.source, session.contactReads.availability) === filter)
  );
  return (
    <section aria-label="Inbox sources" className="space-y-4">
      <Select
        label="Inbox filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unorganised', label: 'Unorganised' },
          { value: 'organised', label: 'Organised' },
          { value: 'unresolved', label: 'Unresolved' },
          { value: 'unverified', label: 'Unverified owner' },
        ]}
      />
      {captures.length === 0 ? (
        <p className="text-muted-foreground">No captures in this view.</p>
      ) : (
        captures.map((capture) => (
          <CaptureInboxRow
            key={capture.id}
            session={session}
            capture={capture}
            source={state.source}
            busy={state.busy}
            documentsClient={documentsClient}
          />
        ))
      )}
    </section>
  );
}
function useInboxContactReads(session: CaptureBrowserSession, source: CaptureSource): void {
  useSyncExternalStore(
    session.contacts.subscribe,
    session.contacts.snapshot,
    session.contacts.snapshot
  );
  useSyncExternalStore(
    session.contactReads.subscribe,
    session.contactReads.getVersion,
    session.contactReads.getVersion
  );
  useEffect(() => {
    for (const row of source.associations)
      if (row.removedAt === null && row.target.kind === 'contact')
        void session.contactReads.load(row.target.reference.uri);
  }, [session.contactReads, source.associations]);
}
function CaptureInboxRow({
  session,
  capture,
  source,
  busy,
  documentsClient,
}: {
  session: CaptureBrowserSession;
  capture: Capture;
  source: CaptureSource;
  busy: boolean;
  documentsClient?: CaptureWorkspaceProps['documentsClient'];
}): JSX.Element {
  useSyncExternalStore(
    session.records.subscribe,
    session.records.getVersion,
    session.records.getVersion
  );
  return (
    <article
      aria-label={`Capture ${capture.id}`}
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{capture.title ?? `Capture ${capture.id}`}</h2>
        <span className="text-sm text-muted-foreground">
          {captureOrganisation(capture, source, session.contactReads.availability)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words">{capture.originalText}</p>
      {capture.placeId !== null ? (
        <p className="text-sm text-muted-foreground">Recorded place {capture.placeId}</p>
      ) : null}
      {capture.visitId !== null ? (
        <p className="text-sm text-muted-foreground">Recorded visit {capture.visitId}</p>
      ) : null}
      {capture.originalUrl ? <p className="break-words text-sm">{capture.originalUrl}</p> : null}
      <CaptureAttachments
        capture={capture}
        editor={session.editor}
        documentsClient={documentsClient}
        busy={busy}
      />
      <CaptureFields session={session} capture={capture} busy={busy} />
      <CaptureOrganise session={session} capture={capture} source={source} busy={busy} />
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() =>
          void session.editor.commit(
            { kind: 'capture.remove', id: capture.id, expectedRevision: capture.revision },
            'Remove capture'
          )
        }
      >
        Remove capture
      </Button>
    </article>
  );
}

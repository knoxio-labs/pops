import { createDocumentUploadSession } from '../documents/useUploadFields';
import { createCaptureEditor } from './editor';
import { CaptureRecordDrafts } from './record-drafts';

import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { DocumentUploadSession } from '../documents/useUploadFields';
import type { CaptureEditor } from './editor-types';
import type { CaptureIdentity, CapturePerformer, CaptureSource } from './types';

const sessions = new WeakMap<QueryClient, Map<string, CaptureBrowserSession>>();

/** Browser-only owner of one trip's composer, operation history and per-file upload sessions. */
export class CaptureBrowserSession {
  readonly editor: CaptureEditor;
  readonly records: CaptureRecordDrafts;
  private uploads = new Map<string, DocumentUploadSession>();
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(source: CaptureSource, tripId: number, perform: CapturePerformer) {
    this.editor = createCaptureEditor({ source, tripId, perform });
    this.records = new CaptureRecordDrafts(this.editor);
  }
  /** Observe retained upload changes without storing bytes outside this browser session. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Stable primitive snapshot for React's external-store subscription. */
  getVersion = (): number => this.version;
  /** Give each selected File its own identity even when metadata matches another selection. */
  addFile(file: File): void {
    const id = this.editor.addSelection({
      file,
      name: file.name,
      mediaType: file.type,
      references: [],
    });
    if (id === undefined) return;
    this.uploads.set(id, createDocumentUploadSession(file));
    this.changed();
  }
  /** Read the same controlled owner state after navigation, filtering or confirmed Undo. */
  upload(id: string): DocumentUploadSession | undefined {
    return this.uploads.get(id);
  }
  /** Persist accepted task identity synchronously before an upload view can unmount. */
  updateUpload(id: string): Dispatch<SetStateAction<DocumentUploadSession>> {
    return (update) => {
      const before = this.uploads.get(id);
      if (before === undefined) return;
      const next = typeof update === 'function' ? update(before) : update;
      if (next === before) return;
      this.uploads.set(id, next);
      if (next.taskId !== null)
        this.editor.acceptAttachment(id, { kind: 'task', taskId: next.taskId });
      this.changed();
    };
  }
  private changed(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

/** Scope session retention to the host cache lifetime and owning API origin/trip. */
export function findCaptureSession(
  cache: QueryClient,
  identity: CaptureIdentity
): CaptureBrowserSession | undefined {
  return sessions.get(cache)?.get(sessionKey(identity));
}
/** Reuse the same session across Capture, Inbox and Explore route remounts. */
export function retainCaptureSession(
  cache: QueryClient,
  identity: CaptureIdentity,
  source: CaptureSource,
  perform: CapturePerformer
): CaptureBrowserSession {
  let owned = sessions.get(cache);
  if (owned === undefined) {
    owned = new Map();
    sessions.set(cache, owned);
  }
  const key = sessionKey(identity);
  let session = owned.get(key);
  if (session === undefined) {
    session = new CaptureBrowserSession(source, identity.tripId, perform);
    owned.set(key, session);
  }
  return session;
}
function sessionKey(identity: CaptureIdentity): string {
  return JSON.stringify([identity.client?.getConfig().baseUrl ?? '/trips-api', identity.tripId]);
}

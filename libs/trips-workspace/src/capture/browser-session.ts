import { sourceOwner } from '../arrangements/source-owner';
import { createDocumentUploadSession } from '../documents/useUploadFields';
import { CaptureContactChoices } from './contact-choices';
import { CaptureContactReferenceReads } from './contact-reference-reads';
import { createCaptureEditor } from './editor';
import { CaptureRecordDrafts } from './record-drafts';
import { CaptureReferenceIdentities } from './reference-identities';
import { CaptureSourceOwner } from './source-owner';

import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { ContactsHostCapability } from '@pops/pillar-sdk';

import type { SourceOwner } from '../arrangements/source-owner';
import type { DocumentUploadSession } from '../documents/useUploadFields';
import type { CaptureEditor } from './editor-types';
import type { CaptureIdentity, CapturePerformer, CaptureSource } from './types';

const sessions = new WeakMap<QueryClient, Map<string, CaptureBrowserSession>>();

/** Owner resources used only when creating a retained trip session. */
export interface CaptureSessionOptions {
  perform: CapturePerformer;
  contacts?: ContactsHostCapability;
}

/** Browser-only owner of one trip's composer, operation history and per-file upload sessions. */
export class CaptureBrowserSession {
  readonly editor: CaptureEditor;
  readonly records: CaptureRecordDrafts;
  readonly contacts: CaptureContactChoices;
  readonly contactReads: CaptureContactReferenceReads;
  readonly references = new CaptureReferenceIdentities();
  private uploads = new Map<string, DocumentUploadSession>();
  private listeners = new Set<() => void>();
  private version = 0;
  private owner: CaptureSourceOwner | undefined;
  constructor(
    source: CaptureSource,
    tripId: number,
    perform: CapturePerformer,
    contacts?: ContactsHostCapability
  ) {
    this.editor = createCaptureEditor({ source, tripId, perform });
    this.records = new CaptureRecordDrafts(this.editor);
    this.contacts = new CaptureContactChoices(this.editor, this.records, contacts);
    this.contactReads = new CaptureContactReferenceReads(
      contacts?.readContactReference,
      this.contacts.hasKnownReference
    );
  }
  /** Rebind the current transport without permitting retained commands to change their semantic owner. */
  bindPerformer(identity: CaptureIdentity, perform: CapturePerformer): void {
    this.owner ??= new CaptureSourceOwner(identity);
    this.editor.setPerformer(this.owner.bind(identity, perform));
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
  return findCaptureSessionForOwner(cache, sourceOwner(identity));
}
/** Look up the captured semantic owner without consulting its later mutable transport configuration. */
export function findCaptureSessionForOwner(
  cache: QueryClient,
  owner: Pick<SourceOwner, 'origin' | 'tripId'>
): CaptureBrowserSession | undefined {
  return sessions.get(cache)?.get(sessionKey(owner));
}
/** Reuse the same session across contextual Capture, Inbox and Explore remounts. */
export function retainCaptureSession(
  cache: QueryClient,
  identity: CaptureIdentity,
  source: CaptureSource,
  options: CaptureSessionOptions
): CaptureBrowserSession {
  let owned = sessions.get(cache);
  if (owned === undefined) {
    owned = new Map();
    sessions.set(cache, owned);
  }
  const key = sessionKey(sourceOwner(identity));
  let session = owned.get(key);
  if (session === undefined) {
    session = new CaptureBrowserSession(source, identity.tripId, options.perform, options.contacts);
    session.bindPerformer(identity, options.perform);
    owned.set(key, session);
  }
  return session;
}
function sessionKey(owner: Pick<SourceOwner, 'origin' | 'tripId'>): string {
  return JSON.stringify([owner.origin, owner.tripId]);
}

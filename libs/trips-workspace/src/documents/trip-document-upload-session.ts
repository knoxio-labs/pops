import { DocumentUploadSession } from './document-upload-session';
import { documentQueryKeys } from './query-keys';
import { TripDocumentUploadContextError, uploadSessionKey } from './upload-context';
import { UploadRestoration } from './upload-restoration';
import { createDocumentUploadSession } from './useUploadFields';

import type { SetStateAction } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { UploadJournal } from './durable-upload-journal';
import type { DocumentAssociationTarget } from './types';

/** Exact owning target and transports captured by a retained browser upload queue. */
export interface TripDocumentUploadContext {
  readonly tripId: number;
  readonly target: Readonly<DocumentAssociationTarget>;
  readonly tripsClient?: TripsClient;
  readonly documentsClient?: DocumentsClient;
}

/** One distinct selected File and its live owner receipt; identical filenames remain independent. */
export interface TripDocumentFileIntent {
  readonly id: string;
  readonly file: File | null;
  readonly name: string;
  readonly upload: DocumentUploadSession;
}

export { TripDocumentUploadContextError } from './upload-context';

/**
 * A live browser queue bound to one immutable trip/target/owner context. Retain the object
 * above conditional views; its File handles and receipts are not serializable storage.
 */
export class TripDocumentUploadSession {
  readonly context: TripDocumentUploadContext;
  /** Captured owner task namespace; mutable client configuration cannot rebind retained proof. */
  readonly taskScope: readonly [string, string];
  private readonly key: string;
  private journalBinding: string | null = null;
  private intents: readonly TripDocumentFileIntent[] = [];
  private readonly listeners = new Set<() => void>();
  /** Restore outcomes retained with this exact queue, observed through the existing subscription. */
  readonly uploadRestoration = new UploadRestoration(() => {
    for (const listener of this.listeners) listener();
  });

  private constructor(context: TripDocumentUploadContext) {
    this.context = Object.freeze({ ...context, target: Object.freeze({ ...context.target }) });
    this.key = contextKey(context);
    const [kind, origin] = documentQueryKeys.task(context.documentsClient, '');
    this.taskScope = Object.freeze([kind, origin]);
  }

  /** Create independent queue storage, including when another queue has the same target. */
  static create(context: TripDocumentUploadContext): TripDocumentUploadSession {
    return new TripDocumentUploadSession(context);
  }

  /** Reject a different trip, target kind/ID, client identity or origin before mounting owner actions. */
  assertContext(context: TripDocumentUploadContext): void {
    if (
      contextKey(context) !== this.key ||
      context.tripsClient !== this.context.tripsClient ||
      context.documentsClient !== this.context.documentsClient
    )
      throw new TripDocumentUploadContextError();
  }

  /** Recheck mutable owner configuration at the instant an operation is about to start. */
  readonly assertCurrentContext = (): void => this.assertContext(this.context);

  /** Read the stable current queue snapshot for React's external-store subscription. */
  readonly read = (): readonly TripDocumentFileIntent[] => this.intents;

  /** Observe queue additions and receipt replacements across every mounted view. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Retain every selected File as a new intent without filename or object-identity deduplication. */
  readonly addFiles = (files: File[]): void => {
    this.publish([
      ...this.intents,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        upload: createDocumentUploadSession(file),
      })),
    ]);
  };

  /** Rehydrate only exact-context descriptors; no new UUID, File, task or original identity is invented. */
  restore(journal: UploadJournal): void {
    this.uploadRestoration.run(
      journal.bindingKey(),
      () => {
        this.assertCurrentContext();
        if (this.journalBinding !== null && this.journalBinding !== journal.bindingKey())
          throw new TripDocumentUploadContextError();
        this.journalBinding ??= journal.bindingKey();
        const stored = journal.list();
        const known = new Set(this.intents.map((intent) => intent.upload.id));
        const added = stored
          .filter((input) => !known.has(input.operationId))
          .map((input) => ({
            id: input.operationId,
            file: null,
            name: input.fileName,
            upload: DocumentUploadSession.restore(input, journal),
          }));
        if (added.length > 0) this.publish([...this.intents, ...added]);
      },
      'Upload recovery metadata could not be read.'
    );
  }

  /** Apply an origin-guarded per-file controller update without replacing another queue entry. */
  updateFile(id: string, update: SetStateAction<DocumentUploadSession>): void {
    const current = this.intents.find((intent) => intent.id === id);
    if (current === undefined) return;
    const upload = typeof update === 'function' ? update(current.upload) : update;
    if (upload === current.upload) return;
    this.publish(this.intents.map((intent) => (intent.id === id ? { ...intent, upload } : intent)));
  }

  private publish(intents: readonly TripDocumentFileIntent[]): void {
    this.intents = intents;
    for (const listener of this.listeners) listener();
  }
}

/** Initialize a target-bound upload queue that can outlive modal, collapse and route views. */
export function createTripDocumentUploadSession(
  context: TripDocumentUploadContext
): TripDocumentUploadSession {
  return TripDocumentUploadSession.create(context);
}

function contextKey(context: TripDocumentUploadContext): string {
  return uploadSessionKey(
    context.tripId,
    context.target,
    context.tripsClient,
    context.documentsClient
  );
}

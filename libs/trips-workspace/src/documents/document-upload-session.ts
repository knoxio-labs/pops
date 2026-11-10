import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { documentQueryKeys } from './query-keys';
import { TripDocumentUploadContextError } from './upload-context-error';

import type { Client as DocumentsClient } from '../documents-api/client';

/** Live state for one immutable file intent; File bytes remain browser-session data. */
export interface DocumentUploadSnapshot {
  readonly file: File | null;
  readonly uploadError: string | null;
  readonly uploadPending: boolean;
  readonly uploadRejected: boolean;
  readonly uncertain: boolean;
  readonly pickerOpen: boolean;
  readonly ownerLookupCount: number | null;
  readonly taskId: string | null;
  readonly taskReceipt: DocumentUploadTaskReceipt | null;
}

class DocumentUploadIntent {
  readonly id = crypto.randomUUID();
  private snapshot: DocumentUploadSnapshot;
  private readonly listeners = new Set<() => void>();
  private taskOwner: DocumentsClient | null = null;
  private taskScope: readonly [string, string] | null = null;

  constructor(file: File | null) {
    this.snapshot = {
      file,
      uploadError: null,
      uploadPending: false,
      uploadRejected: false,
      uncertain: false,
      pickerOpen: false,
      ownerLookupCount: null,
      taskId: null,
      taskReceipt: null,
    };
  }

  readonly read = (): DocumentUploadSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly canStart = (): boolean =>
    !this.snapshot.uploadPending && !this.snapshot.uncertain && this.snapshot.taskId === null;

  bindOwner(
    client: DocumentsClient | undefined,
    scope?: readonly [string, string]
  ): readonly [string, string] {
    if (this.taskScope === null) {
      const [kind, origin] = documentQueryKeys.task(client, '');
      this.taskScope = Object.freeze<[string, string]>(
        scope === undefined ? [kind, origin] : [scope[0], scope[1]]
      );
      this.taskOwner = client ?? defaultDocumentsClient;
    }
    return this.taskScope;
  }

  assertOwner(client: DocumentsClient | undefined): void {
    const current = client ?? defaultDocumentsClient;
    if (current !== this.taskOwner || (current.getConfig().baseUrl ?? '') !== this.taskScope?.[1]) {
      throw new TripDocumentUploadContextError();
    }
  }

  claim(): boolean {
    if (!this.canStart()) return false;
    this.publish({
      ...this.snapshot,
      uploadPending: true,
      uploadError: null,
      uploadRejected: false,
    });
    return true;
  }

  update<K extends Exclude<keyof DocumentUploadSnapshot, 'file'>>(
    field: K,
    value: DocumentUploadSnapshot[K]
  ): boolean {
    if (Object.is(this.snapshot[field], value)) return false;
    this.publish({ ...this.snapshot, [field]: value });
    return true;
  }

  private publish(snapshot: DocumentUploadSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/**
 * A live receipt for one immutable file intent. Retaining this object retains late task/error
 * results even after another intent becomes selected. Create a new session for every selection,
 * including reselecting the same File; clone neither its fields nor its lifecycle.
 */
export class DocumentUploadSession implements DocumentUploadSnapshot {
  private constructor(readonly intent: DocumentUploadIntent) {}

  /** Initialize a distinct intent; identical File objects never share an upload claim implicitly. */
  static create(file: File | null): DocumentUploadSession {
    return new DocumentUploadSession(new DocumentUploadIntent(file));
  }

  /** Return a React storage notification sharing this intent's live receipt and claim. */
  view(): DocumentUploadSession {
    return new DocumentUploadSession(this.intent);
  }

  get id(): string {
    return this.intent.id;
  }
  get file(): File | null {
    return this.intent.read().file;
  }
  get uploadError(): string | null {
    return this.intent.read().uploadError;
  }
  get uploadPending(): boolean {
    return this.intent.read().uploadPending;
  }
  get uploadRejected(): boolean {
    return this.intent.read().uploadRejected;
  }
  get uncertain(): boolean {
    return this.intent.read().uncertain;
  }
  get pickerOpen(): boolean {
    return this.intent.read().pickerOpen;
  }
  get ownerLookupCount(): number | null {
    return this.intent.read().ownerLookupCount;
  }
  get taskId(): string | null {
    return this.intent.read().taskId;
  }
  get taskReceipt(): DocumentUploadTaskReceipt | null {
    return this.intent.read().taskReceipt;
  }
}
import type { PaperlessTask } from './types';

/** A result actually returned by the Documents owner for this receipt's accepted task. */
export interface DocumentUploadTaskReceipt {
  readonly taskId: string;
  readonly result: PaperlessTask;
}

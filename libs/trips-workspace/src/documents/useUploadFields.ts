import { useCallback, useSyncExternalStore } from 'react';

import { DocumentUploadSession } from './document-upload-session';
import { retainOwnerOriginal } from './owner-task-receipt';

import type { Dispatch, SetStateAction } from 'react';

import type { DocumentUploadSnapshot } from './document-upload-session';
import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';
import type { DurableUploadOperation } from './durable-upload-operation';
import type { PaperlessTask } from './types';

export type { DocumentUploadSession } from './document-upload-session';

/** Stable operations bound to one intent; file replacement creates a distinct session generation. */
export interface UploadFields extends DocumentUploadSnapshot {
  readonly durable: DurableUploadOperation;
  readonly metadata: DurableUploadInput | null;
  readonly ownerRecord: DurableUploadRecord | null;
  readonly ownerMatches: boolean | null;
  reattachFile: (file: File) => Promise<void>;
  setFile: (file: File | null) => void;
  setUploadError: (message: string | null) => void;
  setUploadPending: (value: boolean) => void;
  setUploadRejected: (value: boolean) => void;
  setUncertain: (value: boolean) => void;
  setPickerOpen: (value: boolean) => void;
  setOwnerLookupCount: (count: number | null) => void;
  setTaskId: (id: string | null) => void;
  setTaskReceipt: (taskId: string, result: PaperlessTask) => void;
  clearSelectedFile: () => void;
  canStartUpload: () => boolean;
  claimUpload: () => boolean;
  claimRecovery: () => boolean;
}

/** Initialize a distinct live file receipt; retain it above conditional views and alongside Undo history. */
export function createDocumentUploadSession(file: File | null): DocumentUploadSession {
  return DocumentUploadSession.create(file);
}

/** Bind all state writes to their originating generation, never to the currently selected replacement. */
export function useUploadFields(
  session: DocumentUploadSession,
  setSession: Dispatch<SetStateAction<DocumentUploadSession>>
): UploadFields {
  const intent = session.intent;
  const snapshot = useSyncExternalStore(intent.subscribe, intent.read, intent.read);
  const notify = useCallback(() => {
    setSession((current) => (current.id === intent.id ? current.view() : current));
  }, [intent, setSession]);
  const setField = useCallback(
    <K extends Exclude<keyof DocumentUploadSnapshot, 'file'>>(
      field: K,
      value: DocumentUploadSnapshot[K]
    ): void => {
      if (intent.update(field, value)) notify();
    },
    [intent, notify]
  );
  const setFile = useCallback(
    (file: File | null) => {
      setSession((current) =>
        current.id === intent.id ? createDocumentUploadSession(file) : current
      );
    },
    [intent, setSession]
  );
  const claims = useUploadClaims(intent, notify, setField);
  const setters = useUploadSetters(setField);
  const clearSelectedFile = useCallback(() => setFile(null), [setFile]);
  return {
    ...snapshot,
    durable: intent.durable,
    metadata: intent.durable.readInput(),
    ownerRecord: intent.durable.readRecord(),
    ownerMatches: intent.durable.ownerMatches(),
    reattachFile: async (file) => {
      await intent.reattach(file);
      notify();
    },
    ...setters,
    setFile,
    clearSelectedFile,
    ...claims,
    canStartUpload: intent.canStart,
  };
}

function useUploadClaims(
  intent: DocumentUploadSession['intent'],
  notify: () => void,
  setField: <K extends Exclude<keyof DocumentUploadSnapshot, 'file'>>(
    field: K,
    value: DocumentUploadSnapshot[K]
  ) => void
): Pick<UploadFields, 'claimUpload' | 'claimRecovery' | 'setTaskReceipt'> {
  const claimUpload = useCallback(() => {
    if (!intent.claim()) return false;
    notify();
    return true;
  }, [intent, notify]);
  const claimRecovery = useCallback(() => {
    if (!intent.claimRecovery()) return false;
    notify();
    return true;
  }, [intent, notify]);
  const setTaskReceipt = useCallback(
    (taskId: string, result: PaperlessTask): void => {
      const current = intent.read();
      if (current.taskId !== taskId) return;
      const known = current.taskReceipt?.taskId === taskId ? current.taskReceipt.result : undefined;
      const retained = retainOwnerOriginal(known, result);
      if (known !== retained) setField('taskReceipt', { taskId, result: retained });
    },
    [intent, setField]
  );
  return { claimUpload, claimRecovery, setTaskReceipt };
}

function useUploadSetters(
  setField: <K extends Exclude<keyof DocumentUploadSnapshot, 'file'>>(
    field: K,
    value: DocumentUploadSnapshot[K]
  ) => void
): Omit<
  UploadFields,
  | keyof DocumentUploadSnapshot
  | 'clearSelectedFile'
  | 'setFile'
  | 'claimUpload'
  | 'claimRecovery'
  | 'canStartUpload'
  | 'setTaskReceipt'
  | 'durable'
  | 'metadata'
  | 'ownerRecord'
  | 'ownerMatches'
  | 'reattachFile'
> {
  const setUploadError = useCallback(
    (value: string | null) => setField('uploadError', value),
    [setField]
  );
  const setUploadPending = useCallback(
    (value: boolean) => setField('uploadPending', value),
    [setField]
  );
  const setUploadRejected = useCallback(
    (value: boolean) => setField('uploadRejected', value),
    [setField]
  );
  const setUncertain = useCallback((value: boolean) => setField('uncertain', value), [setField]);
  const setPickerOpen = useCallback((value: boolean) => setField('pickerOpen', value), [setField]);
  const setOwnerLookupCount = useCallback(
    (value: number | null) => setField('ownerLookupCount', value),
    [setField]
  );
  const setTaskId = useCallback((value: string | null) => setField('taskId', value), [setField]);
  return {
    setUploadError,
    setUploadPending,
    setUploadRejected,
    setUncertain,
    setPickerOpen,
    setOwnerLookupCount,
    setTaskId,
  };
}

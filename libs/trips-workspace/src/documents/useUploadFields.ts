import { useCallback, useSyncExternalStore } from 'react';

import { DocumentUploadSession } from './document-upload-session';

import type { Dispatch, SetStateAction } from 'react';

import type { DocumentUploadSnapshot } from './document-upload-session';

export type { DocumentUploadSession } from './document-upload-session';

/** Stable operations bound to one intent; file replacement creates a distinct session generation. */
export interface UploadFields extends DocumentUploadSnapshot {
  setFile: (file: File | null) => void;
  setUploadError: (message: string | null) => void;
  setUploadPending: (value: boolean) => void;
  setUploadRejected: (value: boolean) => void;
  setUncertain: (value: boolean) => void;
  setPickerOpen: (value: boolean) => void;
  setOwnerLookupCount: (count: number | null) => void;
  setTaskId: (id: string | null) => void;
  clearSelectedFile: () => void;
  canStartUpload: () => boolean;
  claimUpload: () => boolean;
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
  const claimUpload = useCallback(() => {
    if (!intent.claim()) return false;
    notify();
    return true;
  }, [intent, notify]);
  const setters = useUploadSetters(setField);
  const clearSelectedFile = useCallback(() => setFile(null), [setFile]);
  return {
    ...snapshot,
    ...setters,
    setFile,
    clearSelectedFile,
    claimUpload,
    canStartUpload: intent.canStart,
  };
}

function useUploadSetters(
  setField: <K extends Exclude<keyof DocumentUploadSnapshot, 'file'>>(
    field: K,
    value: DocumentUploadSnapshot[K]
  ) => void
): Omit<
  UploadFields,
  keyof DocumentUploadSnapshot | 'clearSelectedFile' | 'setFile' | 'claimUpload' | 'canStartUpload'
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

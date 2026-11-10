import { useCallback } from 'react';

import type { Dispatch, SetStateAction } from 'react';

/** Stable state operations for one browser-file intent and its owner task. */
export interface UploadFields extends DocumentUploadSession {
  setFile: (file: File | null) => void;
  setUploadError: (message: string | null) => void;
  setUploadPending: (value: boolean) => void;
  setUploadRejected: (value: boolean) => void;
  setUncertain: (value: boolean) => void;
  setPickerOpen: (value: boolean) => void;
  setOwnerLookupCount: (count: number | null) => void;
  setTaskId: (id: string | null) => void;
  clearSelectedFile: () => void;
}

/** Session-owned file handle and owner response state; File bytes are never serializable provenance. */
export interface DocumentUploadSession {
  file: File | null;
  uploadError: string | null;
  uploadPending: boolean;
  uploadRejected: boolean;
  uncertain: boolean;
  pickerOpen: boolean;
  ownerLookupCount: number | null;
  taskId: string | null;
}

/** Initialize one distinct selected file; keep this session above any view that may unmount. */
export function createDocumentUploadSession(file: File | null): DocumentUploadSession {
  return {
    file,
    uploadError: null,
    uploadPending: false,
    uploadRejected: false,
    uncertain: false,
    pickerOpen: false,
    ownerLookupCount: null,
    taskId: null,
  };
}

/** Bind a controlled file session to stable setters, retaining task acceptance across view remounts. */
export function useUploadFields(
  session: DocumentUploadSession,
  setSession: Dispatch<SetStateAction<DocumentUploadSession>>
): UploadFields {
  const setField = useCallback(
    <K extends keyof DocumentUploadSession>(field: K, value: DocumentUploadSession[K]): void => {
      setSession((previous) =>
        Object.is(previous[field], value) ? previous : { ...previous, [field]: value }
      );
    },
    [setSession]
  );
  const setters = useUploadSetters(setField);
  const clearSelectedFile = useCallback(() => {
    setSession(createDocumentUploadSession(null));
  }, [setSession]);
  return { ...session, ...setters, clearSelectedFile };
}

function useUploadSetters(
  setField: <K extends keyof DocumentUploadSession>(
    field: K,
    value: DocumentUploadSession[K]
  ) => void
): Omit<UploadFields, keyof DocumentUploadSession | 'clearSelectedFile'> {
  const setFile = useCallback((value: File | null) => setField('file', value), [setField]);
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
    setFile,
    setUploadError,
    setUploadPending,
    setUploadRejected,
    setUncertain,
    setPickerOpen,
    setOwnerLookupCount,
    setTaskId,
  };
}

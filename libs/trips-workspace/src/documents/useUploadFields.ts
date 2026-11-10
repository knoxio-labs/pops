import { useCallback, useState } from 'react';

/** Isolated upload state for one explicit trip, target and owner-client session. */
export interface UploadFields {
  file: File | null;
  setFile: (file: File | null) => void;
  uploadError: string | null;
  setUploadError: (message: string | null) => void;
  uploadRejected: boolean;
  setUploadRejected: (value: boolean) => void;
  uncertain: boolean;
  setUncertain: (value: boolean) => void;
  pickerOpen: boolean;
  setPickerOpen: (value: boolean) => void;
  ownerLookupCount: number | null;
  setOwnerLookupCount: (count: number | null) => void;
  taskId: string | null;
  setTaskId: (id: string | null) => void;
  clearSelectedFile: () => void;
}

interface UploadSession {
  file: File | null;
  uploadError: string | null;
  uploadRejected: boolean;
  uncertain: boolean;
  pickerOpen: boolean;
  ownerLookupCount: number | null;
  taskId: string | null;
}

/** Keep one selected file's accepted task and recovery state within its mounted intent. */
export function useUploadFields(file: File | null): UploadFields {
  const [session, setSession] = useState<UploadSession>(() => ({
    file,
    uploadError: null,
    uploadRejected: false,
    uncertain: false,
    pickerOpen: false,
    ownerLookupCount: null,
    taskId: null,
  }));
  const setField = useCallback(
    <K extends keyof UploadSession>(field: K, value: UploadSession[K]): void => {
      setSession((previous) =>
        Object.is(previous[field], value) ? previous : { ...previous, [field]: value }
      );
    },
    []
  );
  const setters = useUploadSetters(setField);
  const clearSelectedFile = useCallback(() => {
    setSession({
      file: null,
      uploadError: null,
      uploadRejected: false,
      uncertain: false,
      pickerOpen: false,
      ownerLookupCount: null,
      taskId: null,
    });
  }, []);
  return { ...session, ...setters, clearSelectedFile };
}

function useUploadSetters(
  setField: <K extends keyof UploadSession>(field: K, value: UploadSession[K]) => void
): Omit<UploadFields, keyof UploadSession | 'clearSelectedFile'> {
  const setFile = useCallback((value: File | null) => setField('file', value), [setField]);
  const setUploadError = useCallback(
    (value: string | null) => setField('uploadError', value),
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
    setUploadRejected,
    setUncertain,
    setPickerOpen,
    setOwnerLookupCount,
    setTaskId,
  };
}

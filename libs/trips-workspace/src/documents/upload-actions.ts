import { uploadFileProblem } from './model';

import type { PaperlessUploadPolicy } from './types';
import type { UploadFields } from './useUploadFields';

/** Check the current Documents policy before submitting the selected original. */
export function submitSelectedFile(input: {
  file: File | null;
  policy: PaperlessUploadPolicy | undefined;
  upload: (file: File) => void;
  setError: (message: string) => void;
  setRejected: (rejected: boolean) => void;
}): void {
  const { file, policy, upload, setError, setRejected } = input;
  if (file === null) return;
  setRejected(false);
  const problem = uploadFileProblem(file, policy ?? null);
  if (problem !== undefined) {
    setError(problem);
    setRejected(false);
    return;
  }
  upload(file);
}

/** Clear an ambiguous upload only after an owner search found no matching original. */
export function recoverAmbiguousUpload(fields: UploadFields): void {
  if (!fields.uncertain) return;
  fields.clearSelectedFile();
}

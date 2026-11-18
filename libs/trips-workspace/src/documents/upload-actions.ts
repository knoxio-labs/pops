import { uploadFileProblem } from './model';

import type { DurableUploadInput } from './durable-upload-api';
import type { PaperlessUploadPolicy } from './types';

/** Use immutable owner metadata only for bytes already verified against the retained fingerprint. */
export function uploadPolicyFile(
  file: File,
  verifiedInput?: DurableUploadInput | null
): Pick<File, 'name' | 'size' | 'type'> {
  return verifiedInput === undefined || verifiedInput === null
    ? file
    : {
        name: verifiedInput.fileName,
        size: verifiedInput.byteLength,
        type: verifiedInput.mimeType,
      };
}

/** Check the current Documents policy using verified retained metadata when resuming the original. */
export function submitSelectedFile(input: {
  file: File | null;
  verifiedInput?: DurableUploadInput | null;
  policy: PaperlessUploadPolicy | undefined;
  upload: (file: File) => void;
  setError: (message: string) => void;
  setRejected: (rejected: boolean) => void;
}): void {
  const { file, policy, upload, setError, setRejected } = input;
  if (file === null) return;
  setRejected(false);
  const problem = uploadFileProblem(uploadPolicyFile(file, input.verifiedInput), policy ?? null);
  if (problem !== undefined) {
    setError(problem);
    setRejected(false);
    return;
  }
  upload(file);
}

import type { DurableUploadPersistence } from './durable-upload-persistence';

/** Remove one explicitly failed intent only while its latest owner proof and original journal lease remain valid. */
export async function dismissFailedUpload(
  operationId: string,
  persistence: DurableUploadPersistence,
  hasFailedProof: () => boolean
): Promise<void> {
  if (!hasFailedProof())
    throw new Error('Only a confirmed failed upload can be removed from recovery.');
  try {
    const journal = persistence.require();
    await journal.verify();
    if (!hasFailedProof()) throw new Error('Check the original upload outcome before removing it.');
    journal.complete(operationId);
  } catch {
    throw new Error(
      'The failed upload could not be removed from recovery storage. Retry Remove after verifying sign-in and browser storage.'
    );
  }
}

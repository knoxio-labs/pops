/** An unknown write requires explicit GET recovery, never another automatic upload attempt. */
export class DurableUploadRecoveryRequired extends Error {
  constructor() {
    super(
      'The upload outcome is not confirmed. Check upload status; do not upload this file again.'
    );
  }
}

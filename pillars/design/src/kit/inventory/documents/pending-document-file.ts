/**
 * A document waiting to upload, as the uploader and its rows both read it.
 *
 * Its own module so the leaf components can name it without importing their
 * parent. The app has each leaf import the type from the component that
 * renders it, which costs it a circular dependency per pair (all six sit in
 * `.dependency-cruiser-known-violations.json`).
 */

export interface PendingDocumentFile {
  /** Client-side identifier for tracking. */
  localId: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  /** Upload progress 0–100. */
  progress?: number;
  /** Error message if `status === 'error'`. */
  error?: string;
}

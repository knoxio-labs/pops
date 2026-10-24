/** How long each kind of call to Paperless may take, in milliseconds. */
export const PAPERLESS_TIMEOUTS = {
  read: 5_000,
  /** Paperless re-indexes a document's full text on save and delete, which can outlast a read. */
  write: 30_000,
  thumbnail: 10_000,
  /** Bytes move through these calls, so they get minutes rather than seconds. */
  transfer: 300_000,
} as const;

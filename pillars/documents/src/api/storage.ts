import { resolve } from 'node:path';

import { openDocumentsDb } from '../db/open-documents-db.js';
import { DispatchGuard } from './uploads/dispatch-guard.js';
import { DurableUploads } from './uploads/service.js';

/** Server-owned durable producer, health probe and orderly close handle. */
export interface UploadStorage {
  uploads: DurableUploads;
  check: () => void;
  close: () => void;
}

/** Open Documents-owned private upload storage; the server owns its lifetime. */
export function openUploadStorage(): UploadStorage {
  const directory = resolve(process.env['DOCUMENTS_DATA_DIR'] ?? './data/documents');
  const database = openDocumentsDb(resolve(directory, 'documents.db'));
  const guard = new DispatchGuard(
    database.db,
    resolve(process.env['DOCUMENTS_UPLOAD_GUARD_DIR'] ?? './data/documents-upload-guard'),
    process.env['DOCUMENTS_UPLOAD_GUARD_ID'],
    directory
  );
  return {
    uploads: new DurableUploads(database.db, resolve(directory, 'spool'), guard),
    check: (): void => {
      database.raw.prepare('SELECT 1').get();
      if (!guard.available()) throw new Error('Upload dispatch history is unavailable');
    },
    close: (): void => {
      database.raw.close();
    },
  };
}

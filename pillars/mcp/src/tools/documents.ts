import { documentReadTools } from './inventory-documents-read.js';
import { documentCreateUploadTool } from './inventory-documents-upload.js';
import { documentWriteTools } from './inventory-documents-write.js';

import type { ToolDef } from './tool-def.js';

/** Item documents in Paperless: search, list, upload, link, edit, unlink, dismiss and delete. */
export const documentTools: readonly ToolDef[] = [
  ...documentReadTools,
  documentCreateUploadTool(),
  ...documentWriteTools,
];

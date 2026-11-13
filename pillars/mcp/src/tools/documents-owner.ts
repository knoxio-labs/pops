import { documentsOwnerReadTools } from './documents-owner-read.js';
import { documentsCreateUploadTool, documentsUploadStatusTool } from './documents-owner-upload.js';

import type { ToolDef } from './tool-def.js';

/** Documents-owned reads and gateway-retained streamed ingestion; association commands remain with their owning pillar. */
export const documentsOwnerTools: readonly ToolDef[] = [
  ...documentsOwnerReadTools,
  documentsCreateUploadTool(),
  documentsUploadStatusTool(),
];

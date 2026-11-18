import { createDocumentUploadHost } from './document-upload-host';

/** The single Shell upload authority shared by remote pages and actual sign-out integrations. */
export const documentUploadHost = createDocumentUploadHost();

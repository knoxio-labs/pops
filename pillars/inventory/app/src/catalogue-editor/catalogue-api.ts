import {
  typesManageAbandonDraft,
  typesManageCreateDraft,
  typesManagePatchDraft,
  typesManagePreviewDraft,
  typesManagePublishDraft,
  typesManageReadDraft,
  typesReadAudit,
  typesReadCatalogue,
} from '../inventory-api/index.js';

/** Generated catalogue endpoints consumed by the owner editor. */
export const catalogueApi = {
  abandonDraft: typesManageAbandonDraft,
  createDraft: typesManageCreateDraft,
  patchDraft: typesManagePatchDraft,
  previewDraft: typesManagePreviewDraft,
  publishDraft: typesManagePublishDraft,
  readAudit: typesReadAudit,
  readCatalogue: typesReadCatalogue,
  readDraft: typesManageReadDraft,
};

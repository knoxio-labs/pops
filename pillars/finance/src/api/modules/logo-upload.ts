/**
 * Upload/removal orchestration for an institution's logo (POPS-2804).
 *
 * Content-type allowlist: `image/png`, `image/jpeg`, `image/webp`. SVG
 * (`image/svg+xml`) is refused outright, not sanitised — an SVG can carry
 * `<script>`/`onload=`/`foreignObject` payloads that execute in the viewer's
 * origin, and this monorepo has no SVG sanitiser dependency today (checked:
 * neither DOMPurify nor sanitize-html appear anywhere in the workspace).
 * Adding one is a real dependency-vetting decision, not something to guess at
 * inline here — tracked as a follow-up (see the PR description) rather than
 * done in this change. Every other pillar with an image upload (food's hero
 * image, inventory's photos) draws the same PNG/JPEG/WEBP line for the same
 * reason, so this is not a new restriction, just the first one to write down
 * why.
 *
 * Size cap: 2 MiB. A logo is a small square mark, not a photo — food's hero
 * image (a full recipe photo) caps at 8 MiB; 2 MiB is generous for a logo
 * while still keeping a malicious or mistaken upload cheap to reject and
 * store.
 */
import {
  institutionsService,
  logoBlobsService,
  type FinanceDb,
  type InstitutionRow,
} from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';

export const LOGO_ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LogoAllowedContentType = (typeof LOGO_ALLOWED_CONTENT_TYPES)[number];

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export interface UploadInstitutionLogoInput {
  institutionId: string;
  contentType: string;
  /** Raw decoded image bytes. The REST handler decodes the base64 wire field. */
  data: Buffer;
}

function assertAllowedContentType(
  contentType: string
): asserts contentType is LogoAllowedContentType {
  if (!(LOGO_ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new ValidationError(
      undefined,
      `Unsupported content type "${contentType}". Allowed: ${LOGO_ALLOWED_CONTENT_TYPES.join(', ')}`
    );
  }
}

function assertWithinSizeCap(byteLength: number): void {
  if (byteLength === 0) throw new ValidationError(undefined, 'Logo upload is empty.');
  if (byteLength > LOGO_MAX_BYTES) {
    throw new ValidationError(
      undefined,
      `Logo exceeds the maximum allowed size of ${LOGO_MAX_BYTES} bytes.`
    );
  }
}

/**
 * Upload a logo for `input.institutionId`. Order matters: insert the new
 * blob, repoint `institutions.logo_asset_id` to it, THEN delete the old blob
 * — so a crash between steps leaves an orphaned blob row (harmless, just
 * unreferenced bytes) rather than a dangling `logo_asset_id` pointing at
 * nothing.
 */
export function uploadInstitutionLogo(
  db: FinanceDb,
  input: UploadInstitutionLogoInput
): InstitutionRow {
  assertAllowedContentType(input.contentType);
  assertWithinSizeCap(input.data.length);

  const before = institutionsService.getInstitution(db, input.institutionId);
  const blob = logoBlobsService.createLogoBlob(db, {
    contentType: input.contentType,
    data: input.data,
  });
  const updated = institutionsService.setInstitutionLogoAssetId(db, input.institutionId, blob.id);

  if (before.logoAssetId) logoBlobsService.deleteLogoBlob(db, before.logoAssetId);

  return updated;
}

/** Remove an institution's logo. Clears `logo_asset_id` and deletes the blob. */
export function removeInstitutionLogo(db: FinanceDb, institutionId: string): InstitutionRow {
  const before = institutionsService.getInstitution(db, institutionId);
  const updated = institutionsService.setInstitutionLogoAssetId(db, institutionId, null);
  if (before.logoAssetId) logoBlobsService.deleteLogoBlob(db, before.logoAssetId);
  return updated;
}

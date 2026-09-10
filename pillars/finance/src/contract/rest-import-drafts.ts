/**
 * `import-drafts` sub-router (POPS-3329, finance ADR-005): the pending
 * imports, whoever started them.
 *
 * Writes carry the tab's lease token in the body and are refused with a 409
 * `DraftOwnedElsewhere` when another tab holds the draft. A draft this build
 * cannot read, or whose account is archived, lists as `unusable` and 409s
 * `DraftUnusable` on a full read: the only thing left to do with it is
 * `DELETE`. Discarding a live draft deletes nothing else; the rows are the
 * bank's and come back on the next sync.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ClaimImportDraftBodySchema,
  CreateImportDraftBodySchema,
  ImportDraftSchema,
  ImportDraftsQuerySchema,
  ImportDraftSummarySchema,
  LeaseBodySchema,
  WriteImportDraftBodySchema,
} from './rest-import-drafts-schemas.js';
import { ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

const DraftParams = z.object({ id: z.string() });

export const financeImportDraftsContract = c.router({
  list: {
    method: 'GET',
    path: '/import-drafts',
    query: ImportDraftsQuerySchema,
    responses: { 200: z.object({ data: z.array(ImportDraftSummarySchema) }), ...ERR_RESPONSES },
    summary:
      'Every pending import, most recently saved first, with the state a card shows ' +
      '(open, left-open and unusable are derived on read)',
  },
  get: {
    method: 'GET',
    path: '/import-drafts/:id',
    pathParams: DraftParams,
    responses: { 200: z.object({ data: ImportDraftSchema }), ...ERR_RESPONSES },
    summary: 'One draft with its payload; 409 DraftUnusable when this build cannot resume it',
  },
  create: {
    method: 'POST',
    path: '/import-drafts',
    body: CreateImportDraftBodySchema,
    responses: { 201: z.object({ data: ImportDraftSummarySchema }), ...ERR_RESPONSES },
    summary: 'Create a file draft; the creating tab holds the lease',
  },
  write: {
    method: 'PUT',
    path: '/import-drafts/:id',
    pathParams: DraftParams,
    body: WriteImportDraftBodySchema,
    responses: { 200: z.object({ data: ImportDraftSummarySchema }), ...ERR_RESPONSES },
    summary:
      'Write the wizard state through; 409 DraftOwnedElsewhere from a tab that is not the owner',
  },
  claim: {
    method: 'POST',
    path: '/import-drafts/:id/claim',
    pathParams: DraftParams,
    body: ClaimImportDraftBodySchema,
    responses: { 200: z.object({ data: ImportDraftSummarySchema }), ...ERR_RESPONSES },
    summary:
      'Take the lease; 409 DraftOwnedElsewhere while another tab was seen inside the stale window ' +
      'unless forced',
  },
  heartbeat: {
    method: 'POST',
    path: '/import-drafts/:id/heartbeat',
    pathParams: DraftParams,
    body: LeaseBodySchema,
    responses: { 200: z.object({ data: ImportDraftSummarySchema }), ...ERR_RESPONSES },
    summary: 'Prove the tab is still in it; 409 DraftOwnedElsewhere once the lease has moved',
  },
  release: {
    method: 'POST',
    path: '/import-drafts/:id/release',
    pathParams: DraftParams,
    body: LeaseBodySchema,
    responses: { 204: c.noBody(), ...ERR_RESPONSES },
    summary: 'Give the lease up; a token that no longer holds it changes nothing',
  },
  discard: {
    method: 'DELETE',
    path: '/import-drafts/:id',
    pathParams: DraftParams,
    responses: { 204: c.noBody(), ...ERR_RESPONSES },
    summary: 'Discard a draft. A live draft loses only its decisions; the bank resends the rows',
  },
});

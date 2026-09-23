import { hasScopeFor } from '@pops/pillar-sdk/server';

import {
  abandonCatalogueDraft,
  CatalogueApiError,
  createCatalogueDraft,
  patchCatalogueDraft,
  previewCatalogueDraft,
  publishCatalogueDraft,
  readCatalogueAudit,
  readCurrentCatalogueDraft,
  toCatalogueDescriptor,
  type CatalogueAuthor,
  type DraftTarget,
} from '../../catalogue/authoring.js';
import { loadCatalogue, loadPublishedCatalogue } from '../../catalogue/index.js';
import {
  activateMinimumProtocol,
  ProtocolRolloutError,
  readMinimumProtocol,
  SUPPORTED_INVENTORY_PROTOCOL,
} from '../../protocol/rollout.js';
import { readInventoryPrincipal } from '../middleware/identity.js';
import { compatibilityBody, runCatalogue } from './type-catalogue-responses.js';
import { validateCatalogueItemPayload } from './type-catalogue-validation.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { inventoryTypesContract } from '../../contract/rest-sync.js';
import type { CommandDb } from '../../domain/commands/index.js';

type TypesRequest = ServerInferRequest<typeof inventoryTypesContract>;
type PrincipalResponse = Response;

function requireAuthor(response: PrincipalResponse, scope: 'read' | 'manage'): CatalogueAuthor {
  const principal = readInventoryPrincipal(response);
  if (principal.serviceAccount !== null) {
    const required = `inventory.types.${scope}`;
    if (!hasScopeFor(principal.serviceAccount.scopes, required)) {
      throw new CatalogueApiError(
        401,
        'catalogue_unauthorised',
        `Service account is not authorised for '${required}'`
      );
    }
    return {
      kind: 'service',
      id: principal.serviceAccount.name,
      label: principal.serviceAccount.name,
    };
  }
  if (principal.user !== null) {
    return { kind: 'web', id: principal.user.email, label: principal.user.email };
  }
  throw new CatalogueApiError(
    401,
    'catalogue_unauthorised',
    'This endpoint requires an owner session or service-account grant'
  );
}

function draftTarget(
  params: { readonly revision: number },
  body: { readonly baseRevision: number; readonly expectedDraftVersion: number }
): DraftTarget {
  return {
    revision: params.revision,
    baseRevision: body.baseRevision,
    expectedDraftVersion: body.expectedDraftVersion,
  };
}

function makeTypeCatalogueReadHandlers(db: CommandDb) {
  return {
    catalogue: ({ query, headers, res }: TypesRequest['read']['catalogue'] & { res: Response }) =>
      runCatalogue(() => {
        requireAuthor(res, 'read');
        const catalogue = loadCatalogue(db, query.revision, ['published']);
        if (catalogue === null) {
          throw new CatalogueApiError(
            404,
            'catalogue_revision_unknown',
            `Catalogue revision ${query.revision ?? 'current'} was not found`
          );
        }
        const descriptor = toCatalogueDescriptor(db, catalogue);
        const etag = `"catalogue-${catalogue.revision.revision}"`;
        res.setHeader('ETag', etag);
        if (headers['if-none-match'] === etag) return { status: 304 as const, body: undefined };
        return { status: 200 as const, body: descriptor };
      }),
    audit: ({ query, res }: TypesRequest['read']['audit'] & { res: Response }) =>
      runCatalogue(() => {
        requireAuthor(res, 'read');
        const page = readCatalogueAudit(db, query.before, query.limit);
        return { status: 200 as const, body: page };
      }),
    validateItem: ({ body, res }: TypesRequest['read']['validateItem'] & { res: Response }) =>
      runCatalogue(() => {
        requireAuthor(res, 'read');
        return { status: 200 as const, body: validateCatalogueItemPayload(db, body) };
      }),
  };
}

function makeTypeCatalogueManageHandlers(db: CommandDb) {
  const rolloutState = () => {
    const catalogue = loadPublishedCatalogue(db);
    if (catalogue === null) throw new Error('Inventory has no published catalogue');
    return {
      minimumProtocol: readMinimumProtocol(db),
      supportedProtocol: SUPPORTED_INVENTORY_PROTOCOL,
      catalogueMinimumProtocol: catalogue.revision.minimumProtocol,
    };
  };

  return {
    readProtocolRollout: ({
      res,
    }: TypesRequest['manage']['readProtocolRollout'] & { res: Response }) =>
      runCatalogue(() => {
        requireAuthor(res, 'manage');
        return { status: 200 as const, body: rolloutState() };
      }),
    activateProtocolRollout: ({
      body,
      res,
    }: TypesRequest['manage']['activateProtocolRollout'] & { res: Response }) =>
      runCatalogue(() => {
        requireAuthor(res, 'manage');
        try {
          activateMinimumProtocol(db, body.expectedMinimumProtocol, body.minimumProtocol);
        } catch (error) {
          if (!(error instanceof ProtocolRolloutError)) throw error;
          throw new CatalogueApiError(error.status, error.code, error.message);
        }
        return { status: 200 as const, body: rolloutState() };
      }),
    readDraft: ({ res }: TypesRequest['manage']['readDraft'] & { res: Response }) =>
      runCatalogue(() => {
        requireAuthor(res, 'manage');
        return { status: 200 as const, body: readCurrentCatalogueDraft(db) };
      }),
    createDraft: ({ body, res }: TypesRequest['manage']['createDraft'] & { res: Response }) =>
      runCatalogue(() => {
        const author = requireAuthor(res, 'manage');
        return {
          status: 201 as const,
          body: createCatalogueDraft(db, body.baseRevision, author),
        };
      }),
    patchDraft: ({ params, body, res }: TypesRequest['manage']['patchDraft'] & { res: Response }) =>
      runCatalogue(() => {
        requireAuthor(res, 'manage');
        const result = patchCatalogueDraft(db, draftTarget(params, body), body.operations);
        return {
          status: 200 as const,
          body: { draft: result.draft, compatibility: compatibilityBody(result.compatibility) },
        };
      }),
    previewDraft: ({
      params,
      body,
      res,
    }: TypesRequest['manage']['previewDraft'] & { res: Response }) =>
      runCatalogue(() => {
        requireAuthor(res, 'manage');
        const preview = previewCatalogueDraft(db, draftTarget(params, body), body.operations);
        return {
          status: 200 as const,
          body: {
            baseRevision: preview.baseRevision,
            draftRevision: preview.draftRevision,
            compatibility: compatibilityBody(preview.compatibility),
          },
        };
      }),
    publishDraft: ({
      params,
      body,
      res,
    }: TypesRequest['manage']['publishDraft'] & { res: Response }) =>
      runCatalogue(() => {
        const author = requireAuthor(res, 'manage');
        return {
          status: 200 as const,
          body: publishCatalogueDraft(
            db,
            params.revision,
            { ...body, note: body.note ?? null },
            author
          ),
        };
      }),
    abandonDraft: ({
      params,
      body,
      res,
    }: TypesRequest['manage']['abandonDraft'] & { res: Response }) =>
      runCatalogue(() => {
        const author = requireAuthor(res, 'manage');
        return {
          status: 200 as const,
          body: abandonCatalogueDraft(db, draftTarget(params, body), author),
        };
      }),
  };
}

/** Builds the owner-facing catalogue read, audit, draft and publication handlers. */
export function makeTypeCatalogueHandlers(db: CommandDb) {
  return {
    read: makeTypeCatalogueReadHandlers(db),
    manage: makeTypeCatalogueManageHandlers(db),
  };
}

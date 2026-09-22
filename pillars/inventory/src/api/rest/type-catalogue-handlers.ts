import { hasScopeFor } from '@pops/pillar-sdk/server';

import {
  abandonCatalogueDraft,
  CatalogueApiError,
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
  readCatalogueAudit,
  readCurrentCatalogueDraft,
  toCatalogueDescriptor,
  type CatalogueAuthor,
} from '../../catalogue/authoring.js';
import { loadCatalogue } from '../../catalogue/index.js';
import { readInventoryPrincipal } from '../middleware/identity.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { inventoryTypesContract } from '../../contract/rest-sync.js';
import type { CommandDb } from '../../domain/commands/index.js';

type TypesRequest = ServerInferRequest<typeof inventoryTypesContract>;
type PrincipalResponse = Response;

type CatalogueFailure = {
  status: 400 | 401 | 404 | 409;
  body: {
    message: string;
    code: string;
    issues?: {
      definitionId: string | null;
      path: string;
      code: string;
      message: string;
    }[];
  };
};

function failure(error: CatalogueApiError): CatalogueFailure {
  return {
    status: error.status,
    body: {
      message: error.message,
      code: error.code,
      ...(error.issues.length === 0 ? {} : { issues: [...error.issues] }),
    },
  };
}

async function runCatalogue<T>(operation: () => T | Promise<T>): Promise<T | CatalogueFailure> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CatalogueApiError) return failure(error);
    throw error;
  }
}

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

function compatibilityBody(
  result: Awaited<ReturnType<typeof patchCatalogueDraft>>['compatibility']
) {
  return {
    classification: result.classification,
    affectedIds: [...result.affectedIds],
    affectedItems: result.affectedItems,
    changes: result.changes.map((change) => ({ ...change })),
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
  };
}

function makeTypeCatalogueManageHandlers(db: CommandDb) {
  return {
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
        const result = patchCatalogueDraft(db, params.revision, body.baseRevision, body.operations);
        return {
          status: 200 as const,
          body: { draft: result.draft, compatibility: compatibilityBody(result.compatibility) },
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
          body: abandonCatalogueDraft(db, params.revision, body.baseRevision, author),
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

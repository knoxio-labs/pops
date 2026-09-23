import { CatalogueApiError } from '../../catalogue/authoring.js';
import { loadPublishedCatalogue } from '../../catalogue/index.js';
import {
  activateMinimumProtocol,
  ProtocolRolloutError,
  readMinimumProtocol,
  SUPPORTED_INVENTORY_PROTOCOL,
} from '../../protocol/rollout.js';
import { runCatalogue } from './type-catalogue-responses.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { inventoryTypesContract } from '../../contract/rest-sync.js';
import type { CommandDb } from '../../domain/commands/index.js';

type TypesRequest = ServerInferRequest<typeof inventoryTypesContract>;

function rolloutState(db: CommandDb) {
  const catalogue = loadPublishedCatalogue(db);
  if (catalogue === null) throw new Error('Inventory has no published catalogue');
  return {
    minimumProtocol: readMinimumProtocol(db),
    supportedProtocol: SUPPORTED_INVENTORY_PROTOCOL,
    catalogueMinimumProtocol: catalogue.revision.minimumProtocol,
  };
}

/** Builds the owner-authorised protocol rollout read and activation handlers. */
export function makeProtocolRolloutHandlers(
  db: CommandDb,
  requireManage: (response: Response) => void
) {
  return {
    readProtocolRollout: ({
      res,
    }: TypesRequest['manage']['readProtocolRollout'] & { res: Response }) =>
      runCatalogue(() => {
        requireManage(res);
        return { status: 200 as const, body: rolloutState(db) };
      }),
    activateProtocolRollout: ({
      body,
      res,
    }: TypesRequest['manage']['activateProtocolRollout'] & { res: Response }) =>
      runCatalogue(() => {
        requireManage(res);
        try {
          activateMinimumProtocol(db, body.expectedMinimumProtocol, body.minimumProtocol);
        } catch (error) {
          if (!(error instanceof ProtocolRolloutError)) throw error;
          throw new CatalogueApiError(error.status, error.code, error.message);
        }
        return { status: 200 as const, body: rolloutState(db) };
      }),
  };
}

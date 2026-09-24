import { previewComputedFieldOnPublished } from '../../catalogue/computed-field-preview-published.js';
import { previewComputedField } from '../../catalogue/computed-field-preview.js';
import { runCatalogue } from './type-catalogue-responses.js';

import type { ServerInferRequest, ServerInferResponses } from '@ts-rest/core';
import type { Response } from 'express';

import type { ComputedFieldPreview } from '../../catalogue/computed-field-preview-types.js';
import type { inventoryTypesContract } from '../../contract/rest-sync.js';
import type { CommandDb } from '../../domain/commands/index.js';

type TypesRequest = ServerInferRequest<typeof inventoryTypesContract>;
type PreviewRoute = (typeof inventoryTypesContract)['manage']['previewComputedField'];
type PreviewBody = Extract<ServerInferResponses<PreviewRoute>, { status: 200 }>['body'];

function previewBody(preview: ComputedFieldPreview): PreviewBody {
  const { result } = preview;
  const evaluated = {
    dependencies: result.dependencies.map((dependency) => ({ ...dependency })),
    traversedItemIds: [...result.traversedItemIds],
  };
  const items = preview.items.map((item) => ({ ...item }));
  if (result.state === 'unavailable')
    return {
      ...preview,
      items,
      result: {
        ...evaluated,
        state: result.state,
        missingInputs: result.missingInputs.map((entry) => ({ ...entry })),
      },
    };
  if (result.state === 'value')
    return {
      ...preview,
      items,
      result: { ...evaluated, state: result.state, value: result.value },
    };
  return { ...preview, items, result: { ...evaluated, state: result.state, code: result.code } };
}

/** Builds the owner-authorised, non-mutating computed-field preview handler. */
export function makeComputedPreviewHandlers(
  db: CommandDb,
  authorise: (response: Response) => void
) {
  return {
    previewComputedField: ({
      params,
      body,
      res,
    }: TypesRequest['manage']['previewComputedField'] & { res: Response }) =>
      runCatalogue(() => {
        authorise(res);
        const preview = previewComputedField(
          db,
          {
            revision: params.revision,
            baseRevision: body.baseRevision,
            expectedDraftVersion: body.expectedDraftVersion,
          },
          body.operations,
          { typeId: body.typeId, field: body.field, itemId: body.itemId }
        );
        return { status: 200 as const, body: previewBody(preview) };
      }),
    previewComputedFieldOnPublished: ({
      body,
      res,
    }: TypesRequest['manage']['previewComputedFieldOnPublished'] & { res: Response }) =>
      runCatalogue(() => {
        authorise(res);
        const preview = previewComputedFieldOnPublished(db, body.baseRevision, body.operations, {
          typeId: body.typeId,
          field: body.field,
          itemId: body.itemId,
        });
        return { status: 200 as const, body: previewBody(preview) };
      }),
  };
}

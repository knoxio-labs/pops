import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { InventoryApiError, unwrap } from '../../inventory-api-helpers';
import {
  typesManagePreviewComputedField,
  typesManagePreviewComputedFieldOnPublished,
  webList,
} from '../../inventory-api/index.js';
import { draftPreconditions } from '../catalogue-draft';

import type { InventoryApiIssue } from '../../inventory-api-helpers';
import type { CatalogueDescriptor, CatalogueOperation } from '../types';
import type { ComputedPreviewResponse, PreviewItem } from './preview-model';

const PREVIEW_DELAY_MS = 250;
const PICKER_LIMIT = 50;

/**
 * What the preview evaluates: the draft when one exists, the published
 * revision to fall back to when it does not, the unsaved edit, and the field
 * it names.
 */
export interface ComputedPreviewRequest {
  readonly draft: CatalogueDescriptor | null;
  /** The current published revision, used when no draft exists yet. */
  readonly publishedRevision: number | null;
  readonly type: { readonly id: string; readonly key: string; readonly label: string };
  readonly field: { readonly id: string } | { readonly key: string };
  /** The unsaved field operation, or null while the expression is unfinished. */
  readonly operation: CatalogueOperation | null;
}

/** Where the preview request stands, derived for the current item and edit. */
export type PreviewOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'invalid'; readonly issues: readonly InventoryApiIssue[] }
  | { readonly kind: 'failed' }
  | { readonly kind: 'answered'; readonly response: ComputedPreviewResponse };

type Settled = Exclude<PreviewOutcome, { kind: 'idle' | 'loading' }>;

function usePickerItems(typeKey: string, typeLabel: string) {
  return useQuery({
    queryKey: ['inventory', 'computed-preview', 'items', typeKey] as const,
    queryFn: async (): Promise<readonly PreviewItem[]> => {
      const page = unwrap(await webList({ query: { typeKey, limit: PICKER_LIMIT } }));
      return page.items.map((item) => ({ id: item.id, label: item.name, typeLabel }));
    },
  });
}

/**
 * Requests the preview against the draft when one exists, or otherwise
 * against the published catalogue: the unsaved expression never needs a
 * draft created just to be tried out.
 */
async function requestPreview(
  request: ComputedPreviewRequest & { readonly operation: CatalogueOperation },
  itemId: string
): Promise<ComputedPreviewResponse> {
  const operations = [request.operation];
  if (request.draft !== null) {
    return unwrap(
      await typesManagePreviewComputedField({
        path: { revision: request.draft.revision.revision },
        body: {
          ...draftPreconditions(request.draft),
          operations,
          typeId: request.type.id,
          field: request.field,
          itemId,
        },
      })
    );
  }
  if (request.publishedRevision === null)
    throw new Error('No catalogue revision to preview against');
  return unwrap(
    await typesManagePreviewComputedFieldOnPublished({
      body: {
        baseRevision: request.publishedRevision,
        operations,
        typeId: request.type.id,
        field: request.field,
        itemId,
      },
    })
  );
}

function currentOutcome(
  ready: boolean,
  settled: { readonly key: string; readonly outcome: Settled } | null,
  key: string
): PreviewOutcome {
  if (!ready) return { kind: 'idle' };
  return settled?.key === key ? settled.outcome : { kind: 'loading' };
}

/**
 * Runs the "Try on an item" preview: lists items of the type to pick from and
 * evaluates the unsaved expression on the picked one, again after every edit.
 * Only the newest request's answer is kept. Nothing is written by any of it.
 */
export function useComputedPreview(request: ComputedPreviewRequest) {
  const items = usePickerItems(request.type.key, request.type.label);
  const [itemId, setItemId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; outcome: Settled } | null>(null);
  const latest = useRef(request);
  const operationKey = request.operation === null ? null : JSON.stringify(request.operation);
  const draftVersion = request.draft?.revision.draftVersion ?? null;
  const catalogueKey = draftVersion ?? request.publishedRevision;
  const ready = itemId !== null && operationKey !== null && catalogueKey !== null;
  const key = JSON.stringify([itemId, operationKey, catalogueKey, attempt]);

  useEffect(() => {
    latest.current = request;
  });

  useEffect(() => {
    const current = latest.current;
    const operation = current.operation;
    if (
      itemId === null ||
      operation === null ||
      (current.draft === null && current.publishedRevision === null)
    ) {
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      requestPreview({ ...current, operation }, itemId).then(
        (response) => {
          if (live) setSettled({ key, outcome: { kind: 'answered', response } });
        },
        (error: unknown) => {
          if (!live) return;
          const issues = error instanceof InventoryApiError ? error.issues : [];
          setSettled({
            key,
            outcome: issues.length > 0 ? { kind: 'invalid', issues } : { kind: 'failed' },
          });
        }
      );
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [itemId, key]);

  return {
    items: items.data ?? [],
    itemsLoading: items.isLoading,
    itemId,
    pick: setItemId,
    retry: () => setAttempt((current) => current + 1),
    outcome: currentOutcome(ready, settled, key),
  };
}

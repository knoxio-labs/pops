import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { unwrap } from '../../purchases-api-helpers.js';
import {
  productDelete,
  productDeleteAlias,
  productRename,
  productUpdateAlias,
} from '../../purchases-api/index.js';
import { PRODUCT_DICTIONARY_QUERY_KEY } from './useProductDictionary.js';

import type { DictionaryEdit, DictionaryEditKind } from './types.js';

export interface EditOutcome {
  readonly kind: DictionaryEditKind;
  readonly status: 'ok' | 'error';
  /** Populated only on `error`, carrying whatever the server explained. */
  readonly message: string | null;
}

export interface DictionaryEdits {
  apply: (edit: DictionaryEdit) => void;
  isPending: boolean;
  lastOutcome: EditOutcome | null;
}

/**
 * The five verbs the dictionary's write surface has, mapped from what the
 * reader is doing to the route that does it.
 *
 * A merge and a split are the same route with a different body, and so are an
 * assertion and its retraction: `productId: null` mints the wording a product
 * of its own again, and `confirmed: false` returns the entry to a proposal a
 * pass may retire. Nothing here touches a line — every correction is about
 * which wordings are one product, and the lines fall where that puts them on
 * the next read.
 */
async function applyEdit(edit: DictionaryEdit): Promise<DictionaryEditKind> {
  switch (edit.kind) {
    case 'merge':
      unwrap(
        await productUpdateAlias({
          path: { aliasId: edit.aliasId },
          body: { productId: edit.productId },
        })
      );
      break;
    case 'split':
      unwrap(
        await productUpdateAlias({ path: { aliasId: edit.aliasId }, body: { productId: null } })
      );
      break;
    case 'assert':
    case 'retract':
      unwrap(
        await productUpdateAlias({
          path: { aliasId: edit.aliasId },
          body: { confirmed: edit.kind === 'assert' },
        })
      );
      break;
    case 'forgetWording':
      unwrap(await productDeleteAlias({ path: { aliasId: edit.aliasId } }));
      break;
    case 'rename':
      unwrap(
        await productRename({ path: { productId: edit.productId }, body: { label: edit.label } })
      );
      break;
    case 'forgetProduct':
      unwrap(await productDelete({ path: { productId: edit.productId } }));
      break;
  }
  return edit.kind;
}

/**
 * Every correction, and the one refetch each of them needs.
 *
 * The listing is refetched rather than patched from the response, and that is
 * not caution about staleness: a write at one grain moves rows at the other.
 * A split mints a product, a merge can empty one — and a product left with no
 * wordings is deleted in the same write — so the set of products after any of
 * these is something only the listing knows. `PATCH /products/:id` answers
 * with the renamed product, but the listing is the only read that withholds a
 * product no wording reaches, so its answer is the one rendered.
 */
export function useDictionaryEdits(): DictionaryEdits {
  const queryClient = useQueryClient();
  const [lastOutcome, setLastOutcome] = useState<EditOutcome | null>(null);

  const mutation = useMutation({
    mutationFn: applyEdit,
    onSuccess: async (kind) => {
      setLastOutcome({ kind, status: 'ok', message: null });
      await queryClient.invalidateQueries({ queryKey: PRODUCT_DICTIONARY_QUERY_KEY });
    },
    onError: (error: unknown, edit) => {
      setLastOutcome({
        kind: edit.kind,
        status: 'error',
        message: error instanceof Error ? error.message : null,
      });
    },
  });

  return {
    apply: (edit) => mutation.mutate(edit),
    isPending: mutation.isPending,
    lastOutcome,
  };
}

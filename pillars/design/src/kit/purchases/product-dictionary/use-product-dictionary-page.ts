import { useState } from 'react';

import { applyDictionaryEdit } from './edits';
import { DEFAULT_DICTIONARY_FILTERS } from './types';

import type { DictionaryProduct, ProposalOutcome } from '@/fixtures/purchases-dictionary';

import type { DictionaryEdit, DictionaryFilterState, EditOutcome } from './types';

export interface PassState {
  isPending: boolean;
  outcome: ProposalOutcome | null;
  error: string | null;
}

const IDLE_PASS: PassState = { isPending: false, outcome: null, error: null };

export interface UseProductDictionaryPageOptions {
  initialFilters?: DictionaryFilterState;
  initialPass?: PassState;
  initialEditOutcome?: EditOutcome | null;
}

export interface ProductDictionaryPageState {
  products: DictionaryProduct[];
  filters: DictionaryFilterState;
  setFilters: (filters: DictionaryFilterState) => void;
  pass: PassState;
  runPass: () => void;
  editOutcome: EditOutcome | null;
  applyEdit: (edit: DictionaryEdit) => void;
}

function simulatedOutcome(products: readonly DictionaryProduct[]): ProposalOutcome {
  const aliases = products.flatMap((product) => product.aliases);
  return {
    scannedLines: 482,
    observedWordings: aliases.length,
    proposed: 0,
    retired: 0,
    confirmed: aliases.filter((alias) => alias.confirmedAt !== null).length,
  };
}

/**
 * Owns every piece of state `products.tsx` renders, local to the playground:
 * the filter bar, the proposal pass and the correction log. It exists so the
 * screen's states map can seed a condition (a pass mid-run, a status line
 * already showing) without threading each one through every control by hand.
 */
export function useProductDictionaryPage(
  initialProducts: DictionaryProduct[],
  options: UseProductDictionaryPageOptions = {}
): ProductDictionaryPageState {
  const [products, setProducts] = useState(initialProducts);
  const [filters, setFilters] = useState(options.initialFilters ?? DEFAULT_DICTIONARY_FILTERS);
  const [pass, setPass] = useState<PassState>(options.initialPass ?? IDLE_PASS);
  const [editOutcome, setEditOutcome] = useState<EditOutcome | null>(
    options.initialEditOutcome ?? null
  );

  return {
    products,
    filters,
    setFilters,
    pass,
    runPass: () => {
      setPass({ isPending: false, error: null, outcome: simulatedOutcome(products) });
    },
    editOutcome,
    applyEdit: (edit) => {
      setProducts((prev) => applyDictionaryEdit(prev, edit));
      setEditOutcome({ kind: edit.kind, status: 'ok', message: null });
    },
  };
}

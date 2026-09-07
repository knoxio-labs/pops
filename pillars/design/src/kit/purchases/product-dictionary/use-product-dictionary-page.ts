import { useState } from 'react';

import { applyDictionaryEdit } from './edits';
import { DEFAULT_DICTIONARY_FILTERS } from './types';

import type { DictionaryProduct, ProposalOutcome } from '@/fixtures/purchases-dictionary';

import type { DictionaryEdit, DictionaryFilterState, EditOutcome } from './types';

/**
 * The proposal pass's own lifecycle, separate from the dictionary it acts
 * on: whether one is running, what the last one reported, and whether it
 * failed. `outcome` and `error` are not mutually cleared on a new run — the
 * caller decides what to show while `isPending` is true.
 */
export interface PassState {
  isPending: boolean;
  outcome: ProposalOutcome | null;
  error: string | null;
}

const IDLE_PASS: PassState = { isPending: false, outcome: null, error: null };

/**
 * Every piece of starting state `products.tsx`'s `states` map can seed, so a
 * design state can render a condition — a pass mid-run, an edit in flight, a
 * status line already showing — with no interaction required to reach it.
 */
export interface UseProductDictionaryPageOptions {
  initialFilters?: DictionaryFilterState;
  initialPass?: PassState;
  initialEditOutcome?: EditOutcome | null;
  /** Seeds every edit control as mid-write — a design state only; nothing in this hook ever flips it on its own. */
  initialIsEditPending?: boolean;
}

/** Everything `ProductDictionaryPage` reads from and calls back into this hook. */
export interface ProductDictionaryPageState {
  products: DictionaryProduct[];
  filters: DictionaryFilterState;
  setFilters: (filters: DictionaryFilterState) => void;
  pass: PassState;
  runPass: () => void;
  editOutcome: EditOutcome | null;
  applyEdit: (edit: DictionaryEdit) => void;
  /** Whether every edit control should render disabled. Only ever seeded by `initialIsEditPending`: this playground applies an edit synchronously and has no in-flight window to represent otherwise. */
  isEditPending: boolean;
}

/**
 * What a run reports. `retired` is the figure that matters most and is the
 * easiest to leave at zero: a pass takes back the unasserted entries no line
 * prints any more, which can include a proposal the reader was about to act
 * on, so a run that retired nothing is the one case that says least.
 */
function simulatedOutcome(products: readonly DictionaryProduct[]): ProposalOutcome {
  const aliases = products.flatMap((product) => product.aliases);
  return {
    scannedLines: 482,
    observedWordings: aliases.length,
    proposed: 2,
    retired: 3,
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
  const [isEditPending] = useState(options.initialIsEditPending ?? false);

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
    isEditPending,
  };
}

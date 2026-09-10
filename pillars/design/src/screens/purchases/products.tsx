import { dictionaryProducts } from '@/fixtures/purchases-dictionary';
import { manyWordingsProduct } from '@/fixtures/purchases-dictionary-many-wordings';
import { matchesDictionaryFilters, sourcesOf } from '@/kit/purchases/product-dictionary/assertion';
import { DictionaryBody } from '@/kit/purchases/product-dictionary/dictionary-body';
import { editStatusMessage } from '@/kit/purchases/product-dictionary/edit-status';
import { DictionaryFilters } from '@/kit/purchases/product-dictionary/filters';
import { ProposalPassPanel } from '@/kit/purchases/product-dictionary/proposal-pass-panel';
import { useProductDictionaryPage } from '@/kit/purchases/product-dictionary/use-product-dictionary-page';
import { RetryableError } from '@/kit/purchases/retryable-error';
import { useMemo } from 'react';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { DictionaryProduct } from '@/fixtures/purchases-dictionary';
import type { DictionaryFilterState, EditOutcome } from '@/kit/purchases/product-dictionary/types';
import type { PassState } from '@/kit/purchases/product-dictionary/use-product-dictionary-page';
import type { ReactElement } from 'react';

export const meta: ScreenMeta = { title: 'Product dictionary', order: 4, frame: 'web' };

const CAVEAT =
  "Nothing here is written to a line. A product's grouping is resolved fresh on every read, so a correction applies to the orders already stored as well as the ones still to arrive: order counts, cadence and unit-price history for these products are recomputed under the new grouping the next time anything reads them. The one thing a correction does not revisit is a line's item kind: that pass writes its decision onto the line, and a regrouping made afterwards does not re-open it.";

const INTRO =
  'What this pillar has learned about product identity: one product per thing you recognise, and every printed wording that resolves to it. A correction here applies to every line that ever printed that wording.';

interface ProductDictionaryPageProps {
  products: DictionaryProduct[];
  isLoading?: boolean;
  error?: string | null;
  initialFilters?: DictionaryFilterState;
  initialPass?: PassState;
  initialEditOutcome?: EditOutcome | null;
  /** Renders every edit control mid-write, a design state only. */
  initialIsEditPending?: boolean;
  /** Renders one product's forget control pre-armed, a design state only. */
  startArmedProductId?: string;
}

/**
 * `/purchases/products`: what the pillar has learned about product
 * identity, and every way of correcting it, staged here with local fixtures
 * and a local edit simulation (`use-product-dictionary-page.ts`) in place of
 * the real reads and writes.
 */
export function ProductDictionaryPage({
  products: initialProducts,
  isLoading = false,
  error = null,
  initialFilters,
  initialPass,
  initialEditOutcome,
  initialIsEditPending,
  startArmedProductId,
}: ProductDictionaryPageProps): ReactElement {
  const state = useProductDictionaryPage(initialProducts, {
    initialFilters,
    initialPass,
    initialEditOutcome,
    initialIsEditPending,
  });

  const visible = useMemo(
    () => state.products.filter((product) => matchesDictionaryFilters(product, state.filters)),
    [state.products, state.filters]
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Product dictionary" description={INTRO} />

      <ProposalPassPanel
        isPending={state.pass.isPending}
        outcome={state.pass.outcome}
        error={state.pass.error}
        onRun={state.runPass}
      />

      <p className="text-muted-foreground text-xs">{CAVEAT}</p>

      {error !== null ? (
        <RetryableError
          title="Could not load the product dictionary"
          message={error}
          retryLabel="Retry"
          onRetry={() => {}}
        />
      ) : (
        <DictionaryContent
          state={state}
          visible={visible}
          isLoading={isLoading}
          startArmedProductId={startArmedProductId}
        />
      )}
    </div>
  );
}

interface DictionaryContentProps {
  state: ReturnType<typeof useProductDictionaryPage>;
  visible: DictionaryProduct[];
  isLoading: boolean;
  startArmedProductId?: string;
}

/** The loaded dictionary's filters, edit status and listing, once there's no load error to show instead. */
function DictionaryContent({
  state,
  visible,
  isLoading,
  startArmedProductId,
}: DictionaryContentProps): ReactElement {
  return (
    <>
      <DictionaryFilters
        value={state.filters}
        sources={sourcesOf(state.products)}
        onChange={state.setFilters}
      />
      <p role="status" aria-live="polite" className="text-sm">
        {editStatusMessage(state.editOutcome)}
      </p>
      <DictionaryBody
        products={state.products}
        visible={visible}
        isLoading={isLoading}
        isEditPending={state.isEditPending}
        onEdit={state.applyEdit}
        startArmedProductId={startArmedProductId}
      />
    </>
  );
}

export const states: ScreenStates = {
  loading: () => <ProductDictionaryPage products={[]} isLoading />,
  error: () => (
    <ProductDictionaryPage
      products={[]}
      error="The purchases API did not respond. Check the service and try again."
    />
  ),
  empty: () => <ProductDictionaryPage products={[]} />,
  'filtered-empty': () => (
    <ProductDictionaryPage
      products={dictionaryProducts}
      initialFilters={{ source: 'woolworths', assertion: 'unasserted' }}
    />
  ),
  'pass-running': () => (
    <ProductDictionaryPage
      products={dictionaryProducts}
      initialPass={{ isPending: true, outcome: null, error: null }}
    />
  ),
  'pass-failed': () => (
    <ProductDictionaryPage
      products={dictionaryProducts}
      initialPass={{
        isPending: false,
        outcome: null,
        error: 'The pass could not read the lines: the store was locked by another writer.',
      }}
    />
  ),
  'edit-failed': () => (
    <ProductDictionaryPage
      products={dictionaryProducts}
      initialEditOutcome={{
        kind: 'merge',
        status: 'error',
        message: 'the target product was forgotten while this page was open',
      }}
    />
  ),
  'edit-applied': () => (
    <ProductDictionaryPage
      products={dictionaryProducts}
      initialEditOutcome={{ kind: 'assert', status: 'ok', message: null }}
    />
  ),
  'armed-action': () => (
    <ProductDictionaryPage
      products={dictionaryProducts}
      startArmedProductId="prod_charcoal_receipt"
    />
  ),
  'edit-pending': () => (
    <ProductDictionaryPage products={dictionaryProducts} initialIsEditPending />
  ),
  'many-wordings': () => (
    <ProductDictionaryPage products={[...dictionaryProducts, manyWordingsProduct]} />
  ),
};

export default function ProductDictionaryScreen(): ReactElement {
  return <ProductDictionaryPage products={dictionaryProducts} />;
}

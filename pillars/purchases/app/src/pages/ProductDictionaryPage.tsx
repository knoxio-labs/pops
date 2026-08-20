import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { matchesDictionaryFilters, sourcesOf } from './product-dictionary/assertion.js';
import { DictionaryFilters } from './product-dictionary/DictionaryFilters.js';
import { ProductEntry } from './product-dictionary/ProductEntry.js';
import { ProposalPassPanel } from './product-dictionary/ProposalPassPanel.js';
import {
  DEFAULT_DICTIONARY_FILTERS,
  type DictionaryFilterState,
} from './product-dictionary/types.js';
import { useDictionaryEdits } from './product-dictionary/useDictionaryEdits.js';
import { useProductDictionary } from './product-dictionary/useProductDictionary.js';
import { useProposalPass } from './product-dictionary/useProposalPass.js';
import { RetryableError } from './RetryableError.js';

import type { ReactElement } from 'react';

import type { DictionaryProduct } from './product-dictionary/types.js';
import type { EditOutcome } from './product-dictionary/useDictionaryEdits.js';

/**
 * `/purchases/products` — what the pillar has learned about product identity,
 * and every way of correcting it.
 *
 * The dictionary is the only place a printed wording acquires a durable
 * identity for the two adapters that state no product identifier at all. An
 * entry can be wrong — two products a merchant prints identically cannot be
 * told apart here, which is a stated limitation rather than a bug — so what
 * decides whether the dictionary improves or drifts is whether a wrong entry
 * is reachable. Until this page it was reachable only over HTTP.
 *
 * **Nothing here is a decision inbox.** The reconcile queue is a single
 * listbox because its rows are one keystroke each and hold nothing to click;
 * a correction here picks a target out of the whole dictionary, so its rows
 * carry controls and the list is an ordinary one. Copying the keyboard
 * contract would have meant a row that cannot hold the picker the correction
 * needs.
 *
 * **A correction reaches every order already stored.** Product grouping is
 * resolved on read and written to no line, so a merge changes what the
 * aggregates report about the past as well as the future — see
 * `products.history.caveat`, which the page states in its own copy rather
 * than leaving the reader to infer.
 */
export function ProductDictionaryPage(): ReactElement {
  const { t } = useTranslation('purchases');
  const [filters, setFilters] = useState<DictionaryFilterState>(() => ({
    ...DEFAULT_DICTIONARY_FILTERS,
  }));
  const { products, isLoading, error, refetch } = useProductDictionary();
  const pass = useProposalPass();
  const edits = useDictionaryEdits();

  const visible = useMemo(
    () => products.filter((product) => matchesDictionaryFilters(product, filters)),
    [products, filters]
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={t('products.title')} description={t('products.intro')} />

      <ProposalPassPanel
        isPending={pass.isPending}
        outcome={pass.outcome}
        error={pass.error}
        onRun={pass.run}
      />

      <p className="text-muted-foreground text-xs">{t('products.history.caveat')}</p>

      {error !== null && (
        <RetryableError
          title={t('products.error.title')}
          message={error.message}
          retryLabel={t('products.error.retry')}
          onRetry={refetch}
        />
      )}

      {error === null && (
        <>
          <DictionaryFilters value={filters} sources={sourcesOf(products)} onChange={setFilters} />
          <p role="status" aria-live="polite" className="text-sm">
            {editMessage(edits.lastOutcome, t)}
          </p>
          <DictionaryBody
            products={products}
            visible={visible}
            isLoading={isLoading}
            isPending={edits.isPending}
            onEdit={edits.apply}
          />
        </>
      )}
    </div>
  );
}

type Translate = ReturnType<typeof useTranslation<'purchases'>>['t'];

function editMessage(outcome: EditOutcome | null, t: Translate): string {
  if (outcome === null) return '';
  if (outcome.status === 'error') {
    return t('products.status.failed', { message: outcome.message ?? '' });
  }
  return t(`products.status.${outcome.kind}`);
}

interface DictionaryBodyProps {
  products: DictionaryProduct[];
  visible: DictionaryProduct[];
  isLoading: boolean;
  isPending: boolean;
  onEdit: ReturnType<typeof useDictionaryEdits>['apply'];
}

/**
 * An empty dictionary and an empty filter are different answers, and the two
 * empty states say which one this is. A database nobody has run the pass on
 * holds no entries at all and its aggregates group exactly as they did before
 * the dictionary existed — that is a fact about the deployment, where a filter
 * that excluded everything is a fact about the filter.
 */
function DictionaryBody({
  products,
  visible,
  isLoading,
  isPending,
  onEdit,
}: DictionaryBodyProps): ReactElement {
  const { t } = useTranslation('purchases');

  if (isLoading) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t('products.loading')}
      </p>
    );
  }

  if (products.length === 0) {
    return <EmptyPanel title={t('products.empty.title')} hint={t('products.empty.hint')} />;
  }

  if (visible.length === 0) {
    return <EmptyPanel title={t('products.filtered.title')} hint={t('products.filtered.hint')} />;
  }

  return (
    <>
      <p className="text-muted-foreground text-xs">
        {t('products.showing', { shown: visible.length, total: products.length })}
      </p>
      <ul aria-label={t('products.list.ariaLabel')} className="space-y-4">
        {visible.map((product) => (
          <ProductEntry
            key={product.id}
            product={product}
            allProducts={products}
            isPending={isPending}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </>
  );
}

function EmptyPanel({ title, hint }: { title: string; hint: string }): ReactElement {
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="mb-2 text-base font-medium">{title}</p>
      <p className="text-muted-foreground text-sm">{hint}</p>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import { AliasRow } from './AliasRow.js';
import { productAssertion } from './assertion.js';
import { ProductLabelEditor } from './ProductLabelEditor.js';

import type { ReactElement } from 'react';

import type { ProductAssertion } from './assertion.js';
import type { DictionaryEdit, DictionaryProduct } from './types.js';

const ASSERTION_TONE: Readonly<Record<ProductAssertion, 'default' | 'secondary' | 'outline'>> = {
  asserted: 'default',
  partAsserted: 'secondary',
  proposed: 'outline',
};

interface ProductEntryProps {
  product: DictionaryProduct;
  allProducts: readonly DictionaryProduct[];
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * One product: what it is called, who vouched for it, and the wordings that
 * reach it.
 *
 * The badge answers for the whole product and reads `asserted` only where
 * every wording was asserted, which is the rule the leaderboard's `confirmed`
 * flag uses one layer down. A product still holding one proposal is unfinished
 * work and says so, rather than borrowing the confidence of the wordings
 * beside it.
 *
 * Each wording then carries its own marker, so a product that reads
 * part-asserted names which half is which instead of leaving the reader to
 * guess — and a merge that crossed two sources, the one crossing the
 * dictionary permits, is visible as the two entries it is.
 */
export function ProductEntry({
  product,
  allProducts,
  isPending,
  onEdit,
}: ProductEntryProps): ReactElement {
  const { t } = useTranslation('purchases');
  const assertion = productAssertion(product.aliases);

  return (
    <li className="border-border space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProductLabelEditor product={product} isPending={isPending} onEdit={onEdit} />
        <div className="flex items-center gap-2">
          <Badge variant={ASSERTION_TONE[assertion]}>{t(`products.assertion.${assertion}`)}</Badge>
          <span className="text-muted-foreground text-xs">
            {t('products.wordings', { count: product.aliases.length })}
          </span>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {t(`products.assertion.explain.${assertion}`)}
      </p>

      <ul aria-label={t('products.wordingsFor', { label: product.label })} className="space-y-2">
        {product.aliases.map((alias) => (
          <AliasRow
            key={alias.id}
            alias={alias}
            allProducts={allProducts}
            currentProductId={product.id}
            canSplit={product.aliases.length > 1}
            isPending={isPending}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </li>
  );
}

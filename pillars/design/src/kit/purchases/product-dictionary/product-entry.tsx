import { Badge } from '@pops/ui';

import { AliasRow } from './alias-row';
import { forgettingEndsNamedProduct, productAssertion } from './assertion';
import { ProductLabelEditor } from './product-label-editor';

import type { DictionaryProduct } from '@/fixtures/purchases-dictionary';
import type { ReactElement } from 'react';

import type { ProductAssertion } from './assertion';
import type { DictionaryEdit } from './types';

const ASSERTION_TONE: Readonly<Record<ProductAssertion, 'default' | 'secondary' | 'outline'>> = {
  asserted: 'default',
  partAsserted: 'secondary',
  proposed: 'outline',
};

const ASSERTION_LABEL: Readonly<Record<ProductAssertion, string>> = {
  asserted: 'Asserted',
  partAsserted: 'Part asserted',
  proposed: 'Proposed',
};

const ASSERTION_EXPLAIN: Readonly<Record<ProductAssertion, string>> = {
  asserted:
    'A person asserted every wording here. The proposal pass may not retire, repoint or relabel any of them.',
  partAsserted:
    "Some wordings here were asserted and some are still the pass's proposals, so this product is unfinished work: anything summarising it reports it as a proposal.",
  proposed:
    'The proposal pass minted every wording here and nobody has vouched for one. A later pass may retire any of them once no line prints that wording, and a product its last wording leaves is deleted with it. Naming a product holds its wordings back from exactly that, so a name you typed is never lost to a pass.',
};

interface ProductEntryProps {
  product: DictionaryProduct;
  allProducts: readonly DictionaryProduct[];
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
  /** Renders this one product's forget-product control pre-armed, for a design state. */
  startArmed?: boolean;
}

/**
 * One product: what it is called, who vouched for it, and the wordings that
 * reach it. The badge reads `asserted` only where every wording was
 * asserted: a product still holding one proposal is unfinished work and
 * says so, rather than borrowing the confidence of the wordings beside it.
 */
export function ProductEntry({
  product,
  allProducts,
  isPending,
  onEdit,
  startArmed = false,
}: ProductEntryProps): ReactElement {
  const assertion = productAssertion(product.aliases);

  return (
    <li className="border-border space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProductLabelEditor
          product={product}
          isPending={isPending}
          onEdit={onEdit}
          startArmed={startArmed}
        />
        <div className="flex items-center gap-2">
          <Badge variant={ASSERTION_TONE[assertion]}>{ASSERTION_LABEL[assertion]}</Badge>
          <span className="text-muted-foreground text-xs">
            {product.aliases.length === 1 ? '1 wording' : `${product.aliases.length} wordings`}
          </span>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">{ASSERTION_EXPLAIN[assertion]}</p>

      <ul aria-label={`Printed wordings that resolve to ${product.label}`} className="space-y-2">
        {product.aliases.map((alias) => (
          <AliasRow
            key={alias.id}
            alias={alias}
            allProducts={allProducts}
            currentProductId={product.id}
            currentProductLabel={product.label}
            canSplit={product.aliases.length > 1}
            forgetEndsNamedProduct={forgettingEndsNamedProduct(product, alias)}
            isPending={isPending}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </li>
  );
}

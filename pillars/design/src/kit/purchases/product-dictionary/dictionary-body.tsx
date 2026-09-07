import { EmptyPanel } from '@/kit/purchases/empty-panel';

import { ProductEntry } from './product-entry';

import type { DictionaryProduct } from '@/fixtures/purchases-dictionary';
import type { ReactElement } from 'react';

import type { DictionaryEdit } from './types';

interface DictionaryBodyProps {
  products: DictionaryProduct[];
  visible: DictionaryProduct[];
  isLoading: boolean;
  onEdit: (edit: DictionaryEdit) => void;
  /** Renders one product's forget-product control pre-armed, for a design state. */
  startArmedProductId?: string;
}

/**
 * The list itself, and its two distinct empty states. An empty dictionary
 * and an empty filter are different answers: a database nobody has run the
 * pass on holds no entries at all, where a filter that excluded everything
 * is a fact about the filter rather than the data.
 */
export function DictionaryBody({
  products,
  visible,
  isLoading,
  onEdit,
  startArmedProductId,
}: DictionaryBodyProps): ReactElement {
  if (isLoading) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading the dictionary…
      </p>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyPanel
        title="The dictionary is empty"
        hint="Nothing has been learned yet, so every aggregate groups lines by their printed name exactly as it did before this existed. Run the proposal pass to write down the groupings that are already there."
      />
    );
  }

  if (visible.length === 0) {
    return (
      <EmptyPanel
        title="Nothing matches this filter"
        hint="The dictionary holds entries, but none under this source with this assertion. Widen the filter to see the rest."
      />
    );
  }

  return (
    <>
      <p className="text-muted-foreground text-xs">
        Showing {visible.length} of {products.length} products.
      </p>
      <ul aria-label="Learned products" className="space-y-4">
        {visible.map((product) => (
          <ProductEntry
            key={product.id}
            product={product}
            allProducts={products}
            isPending={false}
            onEdit={onEdit}
            startArmed={product.id === startArmedProductId}
          />
        ))}
      </ul>
    </>
  );
}

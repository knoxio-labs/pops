import type { DictionaryProduct } from '@/fixtures/purchases-dictionary';

import type { DictionaryEdit } from './types';

function withoutAlias(products: DictionaryProduct[], aliasId: string): DictionaryProduct[] {
  return products
    .map((product) => ({ ...product, aliases: product.aliases.filter((a) => a.id !== aliasId) }))
    .filter((product) => product.aliases.length > 0);
}

function findAlias(products: readonly DictionaryProduct[], aliasId: string) {
  for (const product of products) {
    const alias = product.aliases.find((a) => a.id === aliasId);
    if (alias) return { product, alias };
  }
  return null;
}

/**
 * Applies one correction to a loaded dictionary the way the pillar's write
 * routes do: a merge or split moves a wording between products and deletes
 * whichever side it leaves empty, forgetting a wording or a product is the
 * same deletion at a different grain, and nothing here ever touches a line —
 * every correction is about which wordings are one product.
 *
 * This is the playground's own local simulation of
 * `useDictionaryEdits.applyEdit`; it exists so the screen can demonstrate a
 * correction without a server, and returns a new array rather than mutating.
 */
export function applyDictionaryEdit(
  products: DictionaryProduct[],
  edit: DictionaryEdit,
  now: () => string = () => new Date().toISOString()
): DictionaryProduct[] {
  switch (edit.kind) {
    case 'merge':
      return applyMerge(products, edit.aliasId, edit.productId);
    case 'split':
      return applySplit(products, edit.aliasId, now);
    case 'assert':
    case 'retract':
      return applyAssertion(products, edit.aliasId, edit.kind === 'assert', now);
    case 'forgetWording':
    case 'forgetWordingWithProduct':
      return withoutAlias(products, edit.aliasId);
    case 'rename':
      return applyRename(products, edit.productId, edit.label, now);
    case 'forgetProduct':
      return products.filter((product) => product.id !== edit.productId);
  }
}

function applyMerge(
  products: DictionaryProduct[],
  aliasId: string,
  targetProductId: string
): DictionaryProduct[] {
  const found = findAlias(products, aliasId);
  if (!found) return products;
  const moved = { ...found.alias };
  const updated = products.map((product) => {
    const remaining = product.aliases.filter((a) => a.id !== aliasId);
    if (product.id !== targetProductId) return { ...product, aliases: remaining };
    return { ...product, aliases: [...remaining, moved] };
  });
  return updated.filter((product) => product.aliases.length > 0);
}

function applySplit(
  products: DictionaryProduct[],
  aliasId: string,
  now: () => string
): DictionaryProduct[] {
  const found = findAlias(products, aliasId);
  if (!found) return products;
  const minted: DictionaryProduct = {
    id: `product-${found.alias.id}-${now()}`,
    label: found.alias.printedName,
    labelConfirmedAt: null,
    createdAt: now(),
    aliases: [found.alias],
  };
  return [...withoutAlias(products, aliasId), minted];
}

function applyAssertion(
  products: DictionaryProduct[],
  aliasId: string,
  asserted: boolean,
  now: () => string
): DictionaryProduct[] {
  return products.map((product) => ({
    ...product,
    aliases: product.aliases.map((alias) =>
      alias.id === aliasId ? { ...alias, confirmedAt: asserted ? now() : null } : alias
    ),
  }));
}

function applyRename(
  products: DictionaryProduct[],
  productId: string,
  label: string,
  now: () => string
): DictionaryProduct[] {
  return products.map((product) =>
    product.id === productId ? { ...product, label, labelConfirmedAt: now() } : product
  );
}

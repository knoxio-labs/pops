import { applyDictionaryEdit } from '@/kit/purchases/product-dictionary/edits';
import { describe, expect, it } from 'vitest';

import type { DictionaryAlias, DictionaryProduct } from '@/fixtures/purchases-dictionary';

const NOW = () => '2026-09-01T00:00:00.000Z';

function alias(overrides: Partial<DictionaryAlias> = {}): DictionaryAlias {
  return {
    id: 'alias-1',
    printedName: 'CHK BRST 1KG',
    normalisedName: 'chk brst 1kg',
    source: 'receipt',
    scopeKey: 'receipt:chk brst 1kg',
    confirmedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function product(
  aliases: DictionaryAlias[],
  overrides: Partial<DictionaryProduct> = {}
): DictionaryProduct {
  return {
    id: 'product-1',
    label: 'Chicken breast 1kg',
    labelConfirmedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    aliases,
    ...overrides,
  };
}

describe('applyDictionaryEdit: merge', () => {
  it('moves the wording onto the target product', () => {
    const a = alias({ id: 'a' });
    const products = [
      product([a, alias({ id: 'b' })], { id: 'source' }),
      product([], { id: 'target' }),
    ];
    const result = applyDictionaryEdit(products, {
      kind: 'merge',
      aliasId: 'a',
      productId: 'target',
    });
    expect(result.find((p) => p.id === 'source')?.aliases.map((x) => x.id)).toEqual(['b']);
    expect(result.find((p) => p.id === 'target')?.aliases.map((x) => x.id)).toEqual(['a']);
  });

  it('deletes the source product once the merge empties it', () => {
    const a = alias({ id: 'a' });
    const products = [product([a], { id: 'source' }), product([], { id: 'target' })];
    const result = applyDictionaryEdit(products, {
      kind: 'merge',
      aliasId: 'a',
      productId: 'target',
    });
    expect(result.map((p) => p.id)).toEqual(['target']);
  });

  it('is a no-op when the wording is not found', () => {
    const products = [product([alias({ id: 'a' })])];
    const result = applyDictionaryEdit(products, {
      kind: 'merge',
      aliasId: 'missing',
      productId: 'product-1',
    });
    expect(result).toEqual(products);
  });
});

describe('applyDictionaryEdit: split', () => {
  it('mints the wording a product of its own, leaving the rest behind', () => {
    const a = alias({ id: 'a' });
    const b = alias({ id: 'b' });
    const products = [product([a, b], { id: 'shared' })];
    const result = applyDictionaryEdit(products, { kind: 'split', aliasId: 'a' }, NOW);
    const remainder = result.find((p) => p.id === 'shared');
    expect(remainder?.aliases.map((x) => x.id)).toEqual(['b']);
    const minted = result.find((p) => p.id !== 'shared');
    expect(minted?.aliases.map((x) => x.id)).toEqual(['a']);
    expect(minted?.labelConfirmedAt).toBeNull();
    expect(minted?.label).toBe(a.printedName);
  });
});

describe('applyDictionaryEdit: assert / retract', () => {
  it('sets confirmedAt on assert and clears it on retract', () => {
    const a = alias({ id: 'a', confirmedAt: null });
    const asserted = applyDictionaryEdit([product([a])], { kind: 'assert', aliasId: 'a' }, NOW);
    expect(asserted[0]?.aliases[0]?.confirmedAt).toBe('2026-09-01T00:00:00.000Z');

    const retracted = applyDictionaryEdit(asserted, { kind: 'retract', aliasId: 'a' }, NOW);
    expect(retracted[0]?.aliases[0]?.confirmedAt).toBeNull();
  });

  it('leaves every other wording untouched', () => {
    const a = alias({ id: 'a', confirmedAt: null });
    const b = alias({ id: 'b', confirmedAt: null });
    const result = applyDictionaryEdit([product([a, b])], { kind: 'assert', aliasId: 'a' }, NOW);
    expect(result[0]?.aliases.find((x) => x.id === 'b')?.confirmedAt).toBeNull();
  });
});

describe('applyDictionaryEdit: forgetWording', () => {
  it('removes only the named wording when others remain', () => {
    const a = alias({ id: 'a' });
    const b = alias({ id: 'b' });
    const result = applyDictionaryEdit([product([a, b])], {
      kind: 'forgetWording',
      aliasId: 'a',
    });
    expect(result[0]?.aliases.map((x) => x.id)).toEqual(['b']);
  });

  it('deletes the product once its last wording is forgotten', () => {
    const only = alias({ id: 'only' });
    const result = applyDictionaryEdit([product([only])], {
      kind: 'forgetWording',
      aliasId: 'only',
    });
    expect(result).toEqual([]);
  });

  it('deletes a human-named product the same way via forgetWordingWithProduct', () => {
    const only = alias({ id: 'only' });
    const named = product([only], { labelConfirmedAt: '2026-08-20T00:00:00.000Z' });
    const result = applyDictionaryEdit([named], {
      kind: 'forgetWordingWithProduct',
      aliasId: 'only',
    });
    expect(result).toEqual([]);
  });
});

describe('applyDictionaryEdit: rename', () => {
  it('relabels the product and marks it human-named, leaving its wordings alone', () => {
    const a = alias({ id: 'a' });
    const result = applyDictionaryEdit(
      [product([a], { id: 'p', labelConfirmedAt: null })],
      { kind: 'rename', productId: 'p', label: 'Chicken Breast' },
      NOW
    );
    expect(result[0]).toMatchObject({
      label: 'Chicken Breast',
      labelConfirmedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(result[0]?.aliases).toEqual([a]);
  });
});

describe('applyDictionaryEdit: forgetProduct', () => {
  it('removes the whole product and every wording it held', () => {
    const products = [
      product([alias({ id: 'a' }), alias({ id: 'b' })], { id: 'gone' }),
      product([alias({ id: 'c' })], { id: 'stays' }),
    ];
    const result = applyDictionaryEdit(products, { kind: 'forgetProduct', productId: 'gone' });
    expect(result.map((p) => p.id)).toEqual(['stays']);
  });
});

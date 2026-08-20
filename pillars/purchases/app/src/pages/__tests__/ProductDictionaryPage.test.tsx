import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUPurchases from '@pops/locales/en-AU/purchases.json';

import { ProductDictionaryPage } from '../ProductDictionaryPage';

import type { ReactElement } from 'react';

import type { DictionaryAlias, DictionaryProduct } from '../product-dictionary/types';

const productListMock = vi.fn();
const productProposeMock = vi.fn();
const productUpdateAliasMock = vi.fn();
const productDeleteAliasMock = vi.fn();
const productRenameMock = vi.fn();
const productDeleteMock = vi.fn();

vi.mock('../../purchases-api/index.js', () => ({
  productList: (...args: unknown[]) => productListMock(...args),
  productPropose: (...args: unknown[]) => productProposeMock(...args),
  productUpdateAlias: (...args: unknown[]) => productUpdateAliasMock(...args),
  productDeleteAlias: (...args: unknown[]) => productDeleteAliasMock(...args),
  productRename: (...args: unknown[]) => productRenameMock(...args),
  productDelete: (...args: unknown[]) => productDeleteMock(...args),
}));

function buildAlias(overrides: Partial<DictionaryAlias> = {}): DictionaryAlias {
  return {
    id: 'alias-1',
    scopeKey: 'receipt|entity:woolies',
    source: 'receipt',
    normalisedName: 'chk brst 1kg',
    printedName: 'CHK BRST 1KG',
    confirmedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildProduct(overrides: Partial<DictionaryProduct> = {}): DictionaryProduct {
  return {
    id: 'product-1',
    label: 'Chicken breast 1kg',
    labelConfirmedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    aliases: [buildAlias()],
    ...overrides,
  };
}

function dictionaryReturns(...pages: DictionaryProduct[][]): void {
  for (const products of pages.slice(0, -1)) {
    productListMock.mockResolvedValueOnce({ data: { products }, error: undefined });
  }
  productListMock.mockResolvedValue({ data: { products: pages.at(-1) ?? [] }, error: undefined });
}

function writesSucceed(): void {
  productUpdateAliasMock.mockResolvedValue({ data: buildAlias(), error: undefined });
  productDeleteAliasMock.mockResolvedValue({ data: { ok: true }, error: undefined });
  productRenameMock.mockResolvedValue({ data: buildProduct(), error: undefined });
  productDeleteMock.mockResolvedValue({ data: { ok: true }, error: undefined });
}

function renderDictionary(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <ProductDictionaryPage />
    </QueryClientProvider>
  );
  return render(ui);
}

/** The product rows, read as the listing's own children rather than by text. */
async function productEntries(): Promise<HTMLElement[]> {
  const list = await screen.findByRole('list', { name: enAUPurchases['products.list.ariaLabel'] });
  return within(list)
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === list);
}

async function entryFor(label: string): Promise<HTMLElement> {
  const entries = await productEntries();
  const found = entries.find(
    (entry) => within(entry).queryByRole('heading', { name: label }) !== null
  );
  if (found === undefined) throw new Error(`no product entry labelled "${label}"`);
  return found;
}

/** A control by its accessible name, which carries the wording it acts on. */
function control(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

beforeEach(() => {
  productListMock.mockReset();
  productProposeMock.mockReset();
  productUpdateAliasMock.mockReset();
  productDeleteAliasMock.mockReset();
  productRenameMock.mockReset();
  productDeleteMock.mockReset();
  writesSucceed();
});

describe('ProductDictionaryPage — what the dictionary has learned', () => {
  it('renders the heading, the intro and the retroactivity caveat from the catalog', async () => {
    dictionaryReturns([buildProduct()]);
    renderDictionary();

    expect(
      await screen.findByRole('heading', { name: enAUPurchases['products.title'] })
    ).toBeInTheDocument();
    expect(screen.getByText(enAUPurchases['products.intro'])).toBeInTheDocument();
    expect(screen.getByText(enAUPurchases['products.history.caveat'])).toBeInTheDocument();
  });

  it('lists a product with the printed wordings that resolve to it', async () => {
    dictionaryReturns([
      buildProduct({
        aliases: [
          buildAlias({ id: 'a', printedName: 'CHK BRST 1KG' }),
          buildAlias({
            id: 'b',
            printedName: 'Chicken Breast 1kg',
            normalisedName: 'chicken breast 1kg',
          }),
        ],
      }),
    ]);
    renderDictionary();

    const wordings = await screen.findByRole('list', {
      name: 'Printed wordings that resolve to Chicken breast 1kg',
    });
    expect(within(wordings).getByText('CHK BRST 1KG')).toBeInTheDocument();
    expect(within(wordings).getByText('Chicken Breast 1kg')).toBeInTheDocument();
    expect(within(wordings).getByText('matches on chicken breast 1kg')).toBeInTheDocument();
    expect(within(wordings).getAllByText('from receipt')).toHaveLength(2);
  });

  // The distinction `confirmedAt` exists to carry. A surface that flattens it
  // re-creates the failure the column was added to prevent.
  it('marks a proposed wording and an asserted one differently', async () => {
    dictionaryReturns([
      buildProduct({
        aliases: [
          buildAlias({ id: 'a', printedName: 'ONE' }),
          buildAlias({ id: 'b', printedName: 'TWO', confirmedAt: '2026-05-02T00:00:00.000Z' }),
        ],
      }),
    ]);
    renderDictionary();

    expect(await screen.findByText(enAUPurchases['products.alias.proposed'])).toBeInTheDocument();
    expect(screen.getByText(/^Asserted /)).toBeInTheDocument();
  });

  it('reports a product holding one proposal as unfinished, not as asserted', async () => {
    dictionaryReturns([
      buildProduct({
        aliases: [
          buildAlias({ id: 'a', confirmedAt: '2026-05-02T00:00:00.000Z' }),
          buildAlias({ id: 'b', printedName: 'TWO', confirmedAt: null }),
        ],
      }),
    ]);
    renderDictionary();

    const entry = await entryFor('Chicken breast 1kg');
    expect(
      within(entry).getByText(enAUPurchases['products.assertion.partAsserted'])
    ).toBeInTheDocument();
    expect(
      within(entry).getByText(enAUPurchases['products.assertion.explain.partAsserted'])
    ).toBeInTheDocument();
    expect(
      within(entry).queryByText(enAUPurchases['products.assertion.asserted'])
    ).not.toBeInTheDocument();
  });

  it('separates an empty dictionary from a filter that excluded everything', async () => {
    dictionaryReturns([]);
    renderDictionary();

    expect(await screen.findByText(enAUPurchases['products.empty.title'])).toBeInTheDocument();
    expect(screen.queryByText(enAUPurchases['products.filtered.title'])).not.toBeInTheDocument();
  });

  it('offers a retry when the read fails', async () => {
    productListMock.mockResolvedValue({ data: undefined, error: { message: 'upstream is down' } });
    renderDictionary();

    expect(await screen.findByRole('alert')).toHaveTextContent('upstream is down');
    expect(control(enAUPurchases['products.error.retry'])).toBeInTheDocument();
  });
});

describe('ProductDictionaryPage — filters', () => {
  const woolies = buildProduct({
    id: 'product-woolies',
    label: 'Woolworths chicken',
    aliases: [buildAlias({ id: 'a', source: 'receipt', confirmedAt: '2026-05-02T00:00:00.000Z' })],
  });
  const amazon = buildProduct({
    id: 'product-amazon',
    label: 'Amazon cable',
    aliases: [buildAlias({ id: 'b', source: 'amazon', printedName: 'USB-C CABLE' })],
  });

  it('narrows to the wordings a source printed, keeping every source on offer', async () => {
    dictionaryReturns([woolies, amazon]);
    renderDictionary();
    await productEntries();

    await userEvent.selectOptions(
      screen.getByLabelText(enAUPurchases['products.filter.sourceLabel']),
      'amazon'
    );

    await waitFor(async () => expect(await productEntries()).toHaveLength(1));
    await entryFor('Amazon cable');
    // The picker still offers the source its own last answer excluded.
    expect(screen.getByRole('option', { name: 'receipt' })).toBeInTheDocument();
  });

  it('shows the unfinished side of the assertion split', async () => {
    dictionaryReturns([woolies, amazon]);
    renderDictionary();
    await productEntries();

    await userEvent.click(control(enAUPurchases['products.filter.assertion.unasserted']));

    await waitFor(async () => expect(await productEntries()).toHaveLength(1));
    await entryFor('Amazon cable');
  });

  it('names a filter that excluded everything as the filter, not as an empty dictionary', async () => {
    dictionaryReturns([amazon]);
    renderDictionary();
    await productEntries();

    await userEvent.click(control(enAUPurchases['products.filter.assertion.asserted']));

    expect(await screen.findByText(enAUPurchases['products.filtered.title'])).toBeInTheDocument();
    expect(screen.queryByText(enAUPurchases['products.empty.title'])).not.toBeInTheDocument();
  });
});

describe('ProductDictionaryPage — the proposal pass', () => {
  it('runs the pass and reports every figure it answered with', async () => {
    dictionaryReturns([buildProduct()]);
    productProposeMock.mockResolvedValue({
      data: { scannedLines: 490, observedWordings: 212, proposed: 12, retired: 3, confirmed: 7 },
      error: undefined,
    });
    renderDictionary();
    await productEntries();

    await userEvent.click(control(enAUPurchases['products.pass.run']));

    const panel = screen.getByRole('region', { name: enAUPurchases['products.pass.title'] });
    await within(panel).findByText('490');
    expect(within(panel).getByText('212')).toBeInTheDocument();
    expect(within(panel).getByText('12')).toBeInTheDocument();
    // `retired` is the figure a "the pass ran" summary would hide: it counts
    // the proposals this run took back, which may include one the reader was
    // about to act on.
    expect(within(panel).getByText('3')).toBeInTheDocument();
    expect(within(panel).getByText('7')).toBeInTheDocument();
    expect(productProposeMock).toHaveBeenCalledTimes(1);
  });

  it('refetches the dictionary once the pass has run', async () => {
    dictionaryReturns(
      [buildProduct()],
      [buildProduct(), buildProduct({ id: 'p2', label: 'Milk 2L' })]
    );
    productProposeMock.mockResolvedValue({
      data: { scannedLines: 1, observedWordings: 1, proposed: 1, retired: 0, confirmed: 0 },
      error: undefined,
    });
    renderDictionary();
    await productEntries();

    await userEvent.click(control(enAUPurchases['products.pass.run']));

    await waitFor(async () => expect(await productEntries()).toHaveLength(2));
  });

  it('says the pass failed rather than showing figures from a run that did not happen', async () => {
    dictionaryReturns([buildProduct()]);
    productProposeMock.mockResolvedValue({ data: undefined, error: { message: 'no such route' } });
    renderDictionary();
    await productEntries();

    await userEvent.click(control(enAUPurchases['products.pass.run']));

    expect(await screen.findByText(/no such route/)).toBeInTheDocument();
    expect(
      screen.queryByText(enAUPurchases['products.pass.outcome.retired'])
    ).not.toBeInTheDocument();
  });
});

describe('ProductDictionaryPage — correcting an entry', () => {
  const twoProducts = [
    buildProduct({
      id: 'product-1',
      label: 'Chicken breast',
      aliases: [
        buildAlias({ id: 'alias-1', printedName: 'CHK BRST 1KG' }),
        buildAlias({
          id: 'alias-2',
          printedName: 'CHICKEN BREAST',
          normalisedName: 'chicken breast',
        }),
      ],
    }),
    buildProduct({
      id: 'product-2',
      label: 'Milk 2L',
      aliases: [buildAlias({ id: 'alias-3', printedName: 'MLK 2L', normalisedName: 'mlk 2l' })],
    }),
  ];

  it('points one wording at another product', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    await userEvent.selectOptions(
      screen.getByLabelText('Point “CHK BRST 1KG” at another product'),
      'product-2'
    );
    await userEvent.click(control('Point CHK BRST 1KG at the chosen product'));

    await waitFor(() =>
      expect(productUpdateAliasMock).toHaveBeenCalledWith({
        path: { aliasId: 'alias-1' },
        body: { productId: 'product-2' },
      })
    );
  });

  it('refuses the merge until a target has been chosen', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    expect(control('Point CHK BRST 1KG at the chosen product')).toBeDisabled();
  });

  // The undo for a wrong merge, and the reason this page exists: a merge
  // nobody can reverse is a mistake the dictionary keeps forever.
  it('points a wording back out into a product of its own', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Give CHK BRST 1KG its own product'));

    await waitFor(() =>
      expect(productUpdateAliasMock).toHaveBeenCalledWith({
        path: { aliasId: 'alias-1' },
        body: { productId: null },
      })
    );
  });

  // A wording alone on its product already is its own product; splitting it
  // would mint a replacement and orphan the original for no gain.
  it('offers no split for a wording that is the only one its product holds', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    expect(screen.queryByRole('button', { name: 'Give MLK 2L its own product' })).toBeNull();
    expect(control('Give CHK BRST 1KG its own product')).toBeInTheDocument();
  });

  it('asserts a proposal, and retracts an assertion back to a proposal', async () => {
    dictionaryReturns([
      buildProduct({
        aliases: [
          buildAlias({ id: 'alias-1', printedName: 'ONE' }),
          buildAlias({
            id: 'alias-2',
            printedName: 'TWO',
            confirmedAt: '2026-05-02T00:00:00.000Z',
          }),
        ],
      }),
    ]);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Assert ONE'));
    await waitFor(() =>
      expect(productUpdateAliasMock).toHaveBeenCalledWith({
        path: { aliasId: 'alias-1' },
        body: { confirmed: true },
      })
    );

    await userEvent.click(control('Retract TWO'));
    await waitFor(() =>
      expect(productUpdateAliasMock).toHaveBeenCalledWith({
        path: { aliasId: 'alias-2' },
        body: { confirmed: false },
      })
    );
  });

  it('forgets one wording', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the wording CHK BRST 1KG'));

    await waitFor(() =>
      expect(productDeleteAliasMock).toHaveBeenCalledWith({ path: { aliasId: 'alias-1' } })
    );
  });

  it('renames a product without touching its wordings', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Rename Milk 2L'));
    const field = screen.getByLabelText('New name for Milk 2L');
    await userEvent.clear(field);
    await userEvent.type(field, 'Full cream milk 2L');
    await userEvent.click(control(enAUPurchases['products.action.renameSave']));

    await waitFor(() =>
      expect(productRenameMock).toHaveBeenCalledWith({
        path: { productId: 'product-2' },
        body: { label: 'Full cream milk 2L' },
      })
    );
    expect(productUpdateAliasMock).not.toHaveBeenCalled();
  });

  it('refuses to rename a product to nothing', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Rename Milk 2L'));
    await userEvent.clear(screen.getByLabelText('New name for Milk 2L'));

    expect(control(enAUPurchases['products.action.renameSave'])).toBeDisabled();
    expect(productRenameMock).not.toHaveBeenCalled();
  });

  // Forgetting a product takes every wording with it, assertions included, and
  // re-running the pass restores the proposals without the decisions. One
  // click must not be able to do that.
  it('asks twice before forgetting a product', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the product Milk 2L'));
    expect(productDeleteMock).not.toHaveBeenCalled();

    await userEvent.click(control('Forget Milk 2L and every wording that reaches it'));
    await waitFor(() =>
      expect(productDeleteMock).toHaveBeenCalledWith({ path: { productId: 'product-2' } })
    );
  });

  it('lets the second thought stand down without forgetting anything', async () => {
    dictionaryReturns(twoProducts);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the product Milk 2L'));
    await userEvent.click(control('Keep the product Milk 2L'));

    expect(control('Forget the product Milk 2L')).toBeInTheDocument();
    expect(productDeleteMock).not.toHaveBeenCalled();
  });

  it('refetches the listing after a correction rather than patching a row', async () => {
    dictionaryReturns(twoProducts, [twoProducts[1] as DictionaryProduct]);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the wording CHK BRST 1KG'));

    await waitFor(async () => expect(await productEntries()).toHaveLength(1));
    expect(screen.getByText(enAUPurchases['products.status.forgetWording'])).toBeInTheDocument();
  });

  it('keeps forgetting a wording to one click while its product survives it', async () => {
    dictionaryReturns([
      buildProduct({
        id: 'product-named',
        label: 'Full cream milk 2L',
        labelConfirmedAt: '2026-05-03T00:00:00.000Z',
        aliases: [
          buildAlias({ id: 'alias-1', printedName: 'MLK 2L', normalisedName: 'mlk 2l' }),
          buildAlias({ id: 'alias-2', printedName: 'FC MILK 2L', normalisedName: 'fc milk 2l' }),
        ],
      }),
    ]);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the wording MLK 2L'));

    await waitFor(() =>
      expect(productDeleteAliasMock).toHaveBeenCalledWith({ path: { aliasId: 'alias-1' } })
    );
  });

  it('says a correction did not stick, carrying the server’s own explanation', async () => {
    dictionaryReturns(twoProducts);
    productUpdateAliasMock.mockResolvedValue({
      data: undefined,
      error: { message: 'no such product' },
    });
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Give CHK BRST 1KG its own product'));

    expect(await screen.findByText(/no such product/)).toBeInTheDocument();
  });
});

// A product left with no wordings is deleted in the same write, so forgetting
// the last wording reaching a product somebody named destroys the name too —
// and nothing rebuilds it: the next pass re-mints the product wearing the
// printed wording. That is the same loss "Forget this product" spends a second
// click on, reached through a control that spent none.
describe('ProductDictionaryPage — the last wording of a product somebody named', () => {
  const named = buildProduct({
    id: 'product-named',
    label: 'Full cream milk 2L',
    labelConfirmedAt: '2026-05-03T00:00:00.000Z',
    aliases: [buildAlias({ id: 'alias-only', printedName: 'MLK 2L', normalisedName: 'mlk 2l' })],
  });

  it('asks twice before the click that takes the product and its typed name', async () => {
    dictionaryReturns([named]);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the wording MLK 2L'));
    expect(productDeleteAliasMock).not.toHaveBeenCalled();

    await userEvent.click(control('Forget MLK 2L, and the product Full cream milk 2L with it'));
    await waitFor(() =>
      expect(productDeleteAliasMock).toHaveBeenCalledWith({ path: { aliasId: 'alias-only' } })
    );
  });

  it('lets the second thought stand down without forgetting anything', async () => {
    dictionaryReturns([named]);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the wording MLK 2L'));
    await userEvent.click(control('Keep the wording MLK 2L'));

    expect(control('Forget the wording MLK 2L')).toBeInTheDocument();
    expect(productDeleteAliasMock).not.toHaveBeenCalled();
  });

  // The wording-only message would be true and incomplete, which on the one
  // irreversible correction here is the same as misleading.
  it('reports the product as gone too, not only the wording', async () => {
    dictionaryReturns([named], []);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the wording MLK 2L'));
    await userEvent.click(control('Forget MLK 2L, and the product Full cream milk 2L with it'));

    expect(
      await screen.findByText(enAUPurchases['products.status.forgetWordingWithProduct'])
    ).toBeInTheDocument();
    expect(
      screen.queryByText(enAUPurchases['products.status.forgetWording'])
    ).not.toBeInTheDocument();
  });

  // The label is the wording that minted it, so the next pass re-mints an
  // identical product. Nothing a human wrote is at stake and the ceremony
  // would be ceremony readers learn to click through.
  it('keeps one click for the only wording of a product nobody named', async () => {
    dictionaryReturns([
      buildProduct({
        id: 'product-unnamed',
        label: 'MLK 2L',
        labelConfirmedAt: null,
        aliases: [buildAlias({ id: 'alias-only', printedName: 'MLK 2L', normalisedName: 'mlk 2l' })],
      }),
    ]);
    renderDictionary();
    await productEntries();

    await userEvent.click(control('Forget the wording MLK 2L'));

    await waitFor(() =>
      expect(productDeleteAliasMock).toHaveBeenCalledWith({ path: { aliasId: 'alias-only' } })
    );
  });
});

/**
 * Split out of `purchases-dictionary.ts` (which was at the file-length
 * limit): a product with many wordings, so the entry layout can be
 * reviewed under the case it has to survive rather than only the two- and
 * three-alias products in the base fixture set.
 */
import type { DictionaryProduct } from './purchases-dictionary';

/** One product, nine aliases across four sources: three still proposed. */
export const manyWordingsProduct: DictionaryProduct = {
  id: 'prod_coffee_pods',
  label: 'Coffee Capsules 10pk',
  labelConfirmedAt: '2026-08-11T08:30:00.000Z',
  createdAt: '2026-07-20T08:30:00.000Z',
  aliases: [
    {
      id: 'alias_coffee_receipt_1',
      printedName: 'COFFEE CAPS 10PK',
      normalisedName: 'coffee caps 10pk',
      source: 'receipt',
      scopeKey: 'receipt:coffee caps 10pk:store-a',
      confirmedAt: '2026-08-11T08:30:00.000Z',
      createdAt: '2026-07-20T08:30:00.000Z',
    },
    {
      id: 'alias_coffee_receipt_2',
      printedName: 'COFFEE CAPSULES 10',
      normalisedName: 'coffee capsules 10',
      source: 'receipt',
      scopeKey: 'receipt:coffee capsules 10:store-b',
      confirmedAt: '2026-08-11T08:30:00.000Z',
      createdAt: '2026-07-21T08:30:00.000Z',
    },
    {
      id: 'alias_coffee_receipt_3',
      printedName: 'NESP COFFEE PODS 10',
      normalisedName: 'nesp coffee pods 10',
      source: 'receipt',
      scopeKey: 'receipt:nesp coffee pods 10:store-c',
      confirmedAt: null,
      createdAt: '2026-07-22T08:30:00.000Z',
    },
    {
      id: 'alias_coffee_amazon_1',
      printedName: 'Coffee Capsules Original 10 Pack',
      normalisedName: 'coffee capsules original 10 pack',
      source: 'amazon',
      scopeKey: 'amazon:coffee capsules original 10 pack',
      confirmedAt: '2026-08-12T09:00:00.000Z',
      createdAt: '2026-07-23T09:00:00.000Z',
    },
    {
      id: 'alias_coffee_amazon_2',
      printedName: 'Coffee Capsules Original x10',
      normalisedName: 'coffee capsules original x10',
      source: 'amazon',
      scopeKey: 'amazon:coffee capsules original x10',
      confirmedAt: null,
      createdAt: '2026-07-24T09:00:00.000Z',
    },
    {
      id: 'alias_coffee_woolworths_1',
      printedName: 'COFFEE PODS ORIG 10PK',
      normalisedName: 'coffee pods orig 10pk',
      source: 'woolworths',
      scopeKey: 'woolworths:coffee pods orig 10pk',
      confirmedAt: '2026-08-13T09:15:00.000Z',
      createdAt: '2026-07-25T09:15:00.000Z',
    },
    {
      id: 'alias_coffee_woolworths_2',
      printedName: 'COFFEE CAP ORIG 10',
      normalisedName: 'coffee cap orig 10',
      source: 'woolworths',
      scopeKey: 'woolworths:coffee cap orig 10',
      confirmedAt: null,
      createdAt: '2026-07-26T09:15:00.000Z',
    },
    {
      id: 'alias_coffee_coles_1',
      printedName: 'COFFEE CAPS ORIGINAL10',
      normalisedName: 'coffee caps original10',
      source: 'coles',
      scopeKey: 'coles:coffee caps original10',
      confirmedAt: null,
      createdAt: '2026-07-27T09:15:00.000Z',
    },
    {
      id: 'alias_coffee_coles_2',
      printedName: 'NESP ORIGINAL CAPS 10',
      normalisedName: 'nesp original caps 10',
      source: 'coles',
      scopeKey: 'coles:nesp original caps 10',
      confirmedAt: null,
      createdAt: '2026-07-28T09:15:00.000Z',
    },
  ],
};

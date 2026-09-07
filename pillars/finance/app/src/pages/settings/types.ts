import { z } from 'zod';

import { CURRENCY_KINDS } from '@pops/finance';

import type { CurrenciesListResponses } from '../../finance-api/index.js';

export type Currency = CurrenciesListResponses[200]['data'][number];

export const CURRENCY_KIND_OPTIONS = CURRENCY_KINDS.map((kind) => ({ value: kind, label: kind }));

export const CurrencyFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  symbol: z.string(),
  decimals: z.string().regex(/^\d+$/, 'Decimals must be a non-negative whole number'),
  kind: z.enum(CURRENCY_KINDS),
});

export type CurrencyFormValues = z.infer<typeof CurrencyFormSchema>;

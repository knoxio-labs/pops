import { z } from 'zod';

import { CURRENCY_KINDS } from '@pops/finance';

import type {
  CurrenciesListResponses,
  InstitutionsListResponses,
} from '../../finance-api/index.js';

export type Institution = InstitutionsListResponses[200]['data'][number];
export type Currency = CurrenciesListResponses[200]['data'][number];

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export const InstitutionFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  colour: z.string().regex(HEX_COLOUR, 'Colour must be a hex value like #rrggbb'),
});

export type InstitutionFormValues = z.infer<typeof InstitutionFormSchema>;

export const CURRENCY_KIND_OPTIONS = CURRENCY_KINDS.map((kind) => ({ value: kind, label: kind }));

export const CurrencyFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  symbol: z.string(),
  decimals: z.string().regex(/^\d+$/, 'Decimals must be a non-negative whole number'),
  kind: z.enum(CURRENCY_KINDS),
});

export type CurrencyFormValues = z.infer<typeof CurrencyFormSchema>;

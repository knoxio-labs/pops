import { z } from 'zod';

import { TRANSACTION_TYPE_OPTIONS } from '../../lib/transaction-type';

export { ENTITY_TYPES } from '@pops/finance';

export interface Entity {
  id: string;
  name: string;
  type: string | null;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
  transactionCount?: number;
}

/** An entity's default transaction type: a leading "None" plus the full taxonomy. */
export const ENTITY_DEFAULT_TYPE_OPTIONS = [
  { label: 'None', value: '' },
  ...TRANSACTION_TYPE_OPTIONS,
];

export const EntityFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string(),
  abn: z.string(),
  aliases: z.array(z.string()),
  defaultTransactionType: z.string(),
  defaultTags: z.array(z.string()),
  notes: z.string(),
});

export type EntityFormValues = z.infer<typeof EntityFormSchema>;

export const DEFAULT_FORM_VALUES: EntityFormValues = {
  name: '',
  type: 'company',
  abn: '',
  aliases: [],
  defaultTransactionType: '',
  defaultTags: [],
  notes: '',
};

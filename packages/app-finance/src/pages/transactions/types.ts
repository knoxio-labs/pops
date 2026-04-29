import { z } from 'zod';

/**
 * Form-level types for the transaction form dialog.
 *
 * The shape is form-friendly: amount and entityId are strings (text inputs +
 * EntitySelect store strings). The `useTransactionsPage` hook coerces these
 * to the tRPC contract (`amount: number`, `entityId: string | null`) on submit.
 */

/** Transaction record from the API list query (camelCase). */
export interface Transaction {
  id: string;
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country?: string | null;
  relatedTransactionId?: string | null;
  notes?: string | null;
  lastEditedTime?: string;
}

/** Allowed transaction types. Values match the DB/PRD-019 canonical enum: purchase | income | transfer. */
export const TRANSACTION_TYPE_OPTIONS = [
  { label: 'Purchase', value: 'purchase' },
  { label: 'Income', value: 'income' },
  { label: 'Transfer', value: 'transfer' },
];

/**
 * Canonical account list — single source of truth for both the New Transaction
 * form select and the filter row.  Mirrors TRANSACTION_ACCOUNTS in @pops/db-types.
 */
export const TRANSACTION_ACCOUNT_OPTIONS = [
  { label: 'ANZ Everyday', value: 'ANZ Everyday' },
  { label: 'ANZ Savings', value: 'ANZ Savings' },
  { label: 'Amex', value: 'Amex' },
  { label: 'ING Savings', value: 'ING Savings' },
  { label: 'Up Everyday', value: 'Up Everyday' },
];

/**
 * Zod schema for the form values. Amount is collected as a free-form numeric
 * string so the user can type intermediate values like "" or "-" without the
 * input becoming uncontrolled. Date is enforced as YYYY-MM-DD.
 */
export const TransactionFormSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((v) => Number.isFinite(Number(v)), 'Amount must be a valid number')
    .refine((v) => Number(v) !== 0, 'Amount must be non-zero'),
  description: z.string().min(1, 'Description is required'),
  account: z.string().min(1, 'Account is required'),
  type: z.string().min(1, 'Type is required'),
  entityId: z.string(),
  tags: z.array(z.string()),
  notes: z.string(),
});

export type TransactionFormValues = z.infer<typeof TransactionFormSchema>;

export const DEFAULT_TRANSACTION_VALUES: TransactionFormValues = {
  date: '',
  amount: '',
  description: '',
  account: '',
  type: 'purchase',
  entityId: '',
  tags: [],
  notes: '',
};

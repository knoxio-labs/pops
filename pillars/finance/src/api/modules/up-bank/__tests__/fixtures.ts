/**
 * Synthetic Up API resources in the recorded shape (POPS-30). Values are
 * invented; the field layout is the one `developer.up.com.au` documents.
 */
import type { UpAccount, UpTransaction } from '../up-api.js';

export function upAccount(overrides: Partial<UpAccount['attributes']> = {}): UpAccount {
  return {
    id: 'up-acc-1',
    attributes: {
      displayName: 'Up Everyday',
      accountType: 'TRANSACTIONAL',
      ownershipType: 'INDIVIDUAL',
      balance: { currencyCode: 'AUD', value: '488.00', valueInBaseUnits: 48_800 },
      createdAt: '2024-01-01T00:00:00+10:00',
      ...overrides,
    },
  };
}

export interface UpTransactionOverrides {
  id?: string;
  status?: 'HELD' | 'SETTLED';
  description?: string;
  rawText?: string | null;
  cents?: number;
  createdAt?: string;
  settledAt?: string | null;
  transactionType?: string | null;
  transferAccountId?: string | null;
  foreign?: { currencyCode: string; cents: number } | null;
  category?: string | null;
}

const DEFAULTS: Required<Omit<UpTransactionOverrides, 'settledAt'>> = {
  id: 'txn-1',
  status: 'SETTLED',
  description: 'Coles',
  rawText: 'COLES 0412 MELBOURNE',
  cents: -1_200,
  createdAt: '2026-09-01T09:30:00+10:00',
  transactionType: null,
  transferAccountId: null,
  foreign: null,
  category: null,
};

function money(currencyCode: string, cents: number): UpTransaction['attributes']['amount'] {
  return { currencyCode, value: (cents / 100).toFixed(2), valueInBaseUnits: cents };
}

/** A settled row settles when it was created unless the test says otherwise; a held one never has. */
function settledAt(
  o: UpTransactionOverrides,
  status: 'HELD' | 'SETTLED',
  createdAt: string
): string | null {
  if (o.settledAt !== undefined) return o.settledAt;
  return status === 'SETTLED' ? createdAt : null;
}

export function upTransaction(overrides: UpTransactionOverrides = {}): UpTransaction {
  const o = { ...DEFAULTS, ...overrides };
  return {
    id: o.id,
    attributes: {
      status: o.status,
      rawText: o.rawText,
      description: o.description,
      message: null,
      amount: money('AUD', o.cents),
      foreignAmount: o.foreign === null ? null : money(o.foreign.currencyCode, o.foreign.cents),
      cardPurchaseMethod: { method: 'CONTACTLESS', cardNumberSuffix: '0001' },
      settledAt: settledAt(overrides, o.status, o.createdAt),
      createdAt: o.createdAt,
      transactionType: o.transactionType,
    },
    relationships: {
      account: { data: { id: 'up-acc-1' } },
      transferAccount: { data: o.transferAccountId === null ? null : { id: o.transferAccountId } },
      category: { data: o.category === null ? null : { id: o.category } },
      parentCategory: { data: null },
    },
  };
}

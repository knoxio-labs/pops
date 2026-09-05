/**
 * Up Bank REST client (POPS-30): the three reads a sync needs, over
 * `https://api.up.com.au/api/v1` with a personal access token.
 *
 * Only the fields the mapper reads are declared; everything else Up sends is
 * dropped at the parse. `fetchImpl` is injectable so tests run against a
 * recorded shape without a network, and the page walk follows `links.next`
 * verbatim because Up's cursor is opaque and lives only in that URL.
 */
import { z } from 'zod';

export const UP_API_BASE_URL = 'https://api.up.com.au/api/v1';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 1_000;

const MoneySchema = z.object({
  currencyCode: z.string(),
  value: z.string(),
  /** Signed, in the currency's minor units: negative is money out. */
  valueInBaseUnits: z.number().int(),
});

export type UpMoney = z.infer<typeof MoneySchema>;

const RelatedSchema = z.object({ data: z.object({ id: z.string() }).nullable() });

export const UpAccountSchema = z.object({
  id: z.string(),
  attributes: z.object({
    displayName: z.string(),
    accountType: z.string(),
    ownershipType: z.string(),
    balance: MoneySchema,
    createdAt: z.string(),
  }),
});

export type UpAccount = z.infer<typeof UpAccountSchema>;

export const UpTransactionSchema = z.object({
  id: z.string(),
  attributes: z.object({
    status: z.enum(['HELD', 'SETTLED']),
    rawText: z.string().nullable(),
    description: z.string(),
    message: z.string().nullable(),
    amount: MoneySchema,
    foreignAmount: MoneySchema.nullable(),
    cardPurchaseMethod: z
      .object({ method: z.string(), cardNumberSuffix: z.string().nullable() })
      .nullable()
      .optional(),
    settledAt: z.string().nullable(),
    createdAt: z.string(),
    transactionType: z.string().nullable(),
  }),
  relationships: z.object({
    account: z.object({ data: z.object({ id: z.string() }) }),
    transferAccount: RelatedSchema,
    category: RelatedSchema,
    parentCategory: RelatedSchema,
  }),
});

export type UpTransaction = z.infer<typeof UpTransactionSchema>;

interface Page<T> {
  data: T[];
  links: { next: string | null };
}

function pageOf<T>(item: z.ZodType<T>): z.ZodType<Page<T>> {
  return z.object({ data: z.array(item), links: z.object({ next: z.string().nullable() }) });
}

const PingSchema = z.object({ meta: z.object({ id: z.string(), statusEmoji: z.string() }) });

/** A non-2xx answer from Up. */
export class UpBankApiError extends Error {
  override readonly name: string = 'UpBankApiError';
  constructor(
    readonly status: number,
    readonly url: string
  ) {
    super(`Up API ${status} for ${url}`);
  }
}

/** 401: the token is missing, expired or revoked. */
export class UpBankAuthError extends UpBankApiError {
  override readonly name = 'UpBankAuthError' as const;
}

/** Inclusive RFC-3339 bounds for a transaction listing. */
export interface UpTransactionRange {
  since: string;
  until: string;
}

export interface UpBankClient {
  /** Who the token belongs to; throws {@link UpBankAuthError} on a bad token. */
  ping(): Promise<{ customerId: string }>;
  listAccounts(): Promise<UpAccount[]>;
  getAccount(id: string): Promise<UpAccount>;
  /** Every transaction on the account inside `range`, in Up's own order (newest first). */
  listTransactions(accountId: string, range: UpTransactionRange): Promise<UpTransaction[]>;
}

export interface UpBankClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  pageSize?: number;
}

export function createUpBankClient(options: UpBankClientOptions): UpBankClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? UP_API_BASE_URL;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const headers = { Authorization: `Bearer ${options.token}`, Accept: 'application/json' };

  async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    const response = await fetchImpl(url, { headers });
    if (response.status === 401) throw new UpBankAuthError(response.status, url);
    if (!response.ok) throw new UpBankApiError(response.status, url);
    return schema.parse(await response.json());
  }

  async function walkPages<T>(firstUrl: string, item: z.ZodType<T>): Promise<T[]> {
    const page = pageOf(item);
    const items: T[] = [];
    let next: string | null = firstUrl;
    for (let pages = 0; next !== null; pages++) {
      if (pages >= MAX_PAGES) throw new Error(`Up API paging past ${MAX_PAGES} pages at ${next}`);
      const body: Page<T> = await getJson(next, page);
      items.push(...body.data);
      next = body.links.next;
    }
    return items;
  }

  return {
    async ping() {
      const body = await getJson(`${baseUrl}/util/ping`, PingSchema);
      return { customerId: body.meta.id };
    },

    listAccounts() {
      const url = new URL(`${baseUrl}/accounts`);
      url.searchParams.set('page[size]', String(pageSize));
      return walkPages(url.toString(), UpAccountSchema);
    },

    async getAccount(id) {
      const body = await getJson(
        `${baseUrl}/accounts/${encodeURIComponent(id)}`,
        z.object({ data: UpAccountSchema })
      );
      return body.data;
    },

    listTransactions(accountId, range) {
      const url = new URL(`${baseUrl}/accounts/${encodeURIComponent(accountId)}/transactions`);
      url.searchParams.set('page[size]', String(pageSize));
      url.searchParams.set('filter[since]', range.since);
      url.searchParams.set('filter[until]', range.until);
      return walkPages(url.toString(), UpTransactionSchema);
    },
  };
}

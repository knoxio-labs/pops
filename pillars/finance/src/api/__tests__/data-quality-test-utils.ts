import type { makeClient } from './test-utils.js';

type FinanceApiTestClient = ReturnType<typeof makeClient>;

/** Archives the sample accounts installed by Finance migrations for an isolated data-quality test. */
export async function archiveFinanceSeedAccounts(client: FinanceApiTestClient): Promise<void> {
  const { data: accounts } = await client.accounts.list();
  for (const account of accounts) {
    await client.accounts.delete(account.id);
  }
}

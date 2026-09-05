/**
 * Hand-run Up Bank sync (POPS-30), for the first backfill before the
 * scheduler (POPS-2921) exists.
 *
 *   tsx scripts/sync-up-account.ts accounts --secret UP_TOKEN
 *       List the Up accounts the token can see, with their ids — what
 *       `account_import_config.external_account_ref` must name.
 *
 *   tsx scripts/sync-up-account.ts sync --account <accounts.id> \
 *       --from 2026-01-01 --to 2026-09-06 [--dry-run] [--as-of 2026-09-06]
 *       Import the calendar range into the mapped POPS account. `--dry-run`
 *       fetches and maps but writes nothing. The token comes from the
 *       config's `secret_ref` (`<name>_FILE` or `<name>` in the environment).
 *
 * Runs against `FINANCE_SQLITE_PATH` (or `SQLITE_PATH`'s directory); contacts
 * is reached through the usual pillar credential, and without one the entity
 * matcher simply matches nothing.
 */
import { parseArgs } from 'node:util';

import { createContactsClient } from '../src/api/contacts/client.js';
import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import { planUpSync } from '../src/api/modules/up-bank/sync-plan.js';
import { syncUpAccount } from '../src/api/modules/up-bank/sync.js';
import { createUpBankClient } from '../src/api/modules/up-bank/up-api.js';
import { requireNamedSecret } from '../src/api/secrets.js';
import { openFinanceDb } from '../src/db/index.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function usage(message: string): never {
  console.error(message);
  console.error(
    'usage: sync-up-account.ts accounts --secret NAME\n' +
      '       sync-up-account.ts sync --account ID --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run] [--as-of YYYY-MM-DD]'
  );
  process.exit(2);
}

async function listAccounts(secret: string): Promise<void> {
  const client = createUpBankClient({ token: requireNamedSecret(secret) });
  const { customerId } = await client.ping();
  print(`token belongs to customer ${customerId}`);
  for (const account of await client.listAccounts()) {
    const { displayName, accountType, balance } = account.attributes;
    print(
      `${account.id}\t${accountType}\t${balance.value} ${balance.currencyCode}\t${displayName}`
    );
  }
}

interface SyncOptions {
  accountId: string;
  from: string;
  to: string;
  dryRun: boolean;
  asOf: string | undefined;
}

async function sync(options: SyncOptions): Promise<void> {
  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const args = {
      accountId: options.accountId,
      from: options.from,
      to: options.to,
      asOf: options.asOf,
    };
    if (options.dryRun) {
      const plan = await planUpSync(opened.db, args);
      print(
        JSON.stringify(
          {
            account: plan.account,
            upAccount: plan.upAccount.attributes.displayName,
            balanceCents: plan.upAccount.attributes.balance.valueInBaseUnits,
            fetched: plan.fetched,
            newRows: plan.newRows.length,
            settleable: plan.settleable.length,
            alreadyHeld: plan.alreadyHeld,
            sample: plan.newRows.slice(0, 5).map(({ parsed, transactionType }) => ({
              date: parsed.date,
              amount: parsed.amount,
              description: parsed.description,
              transactionType,
              pending: parsed.pending,
            })),
          },
          null,
          2
        )
      );
      return;
    }
    const result = await syncUpAccount(opened.db, createContactsClient(), args);
    print(JSON.stringify(result, null, 2));
  } finally {
    opened.raw.close();
  }
}

interface ParsedValues {
  secret?: string;
  account?: string;
  from?: string;
  to?: string;
  'as-of'?: string;
  'dry-run': boolean;
}

function syncOptions(values: ParsedValues): SyncOptions {
  const { account, from, to } = values;
  if (!account || !from || !to) usage('sync needs --account, --from and --to');
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    usage('--from and --to must be YYYY-MM-DD with from <= to');
  }
  const asOf = values['as-of'];
  if (asOf !== undefined && !DATE.test(asOf)) usage('--as-of must be YYYY-MM-DD');
  return { accountId: account, from, to, dryRun: values['dry-run'], asOf };
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      secret: { type: 'string' },
      account: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      'as-of': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const [command] = positionals;
  if (command === 'accounts') {
    if (!values.secret) usage('accounts needs --secret NAME');
    await listAccounts(values.secret);
    return;
  }
  if (command === 'sync') {
    await sync(syncOptions(values));
    return;
  }
  usage(`unknown command '${command ?? ''}'`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

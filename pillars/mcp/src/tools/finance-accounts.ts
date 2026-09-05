import { finance } from './finance-client.js';
import { mapCallResult, optBool, optNum, reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const LEDGER_SIGN_NOTE =
  'Ledger-signed: positive is money held, negative is money owed, for assets and ' +
  'liabilities alike (a credit card at -213755 means $2,137.55 owed, not a credit).';

const accountsList: ToolDef = {
  name: 'finance.accounts.list',
  description:
    `List accounts with their current balance. ${LEDGER_SIGN_NOTE} Archived accounts ` +
    'are excluded by default; set includeArchived to see them too.',
  inputSchema: {
    type: 'object',
    properties: {
      includeArchived: {
        type: 'boolean',
        description: 'Include archived accounts (excluded by default)',
      },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const includeArchived = optBool(args, 'includeArchived') ?? false;
    const result = await finance().accounts.list({
      archived: includeArchived ? undefined : 'false',
      limit: optNum(args, 'limit'),
      offset: optNum(args, 'offset'),
    });
    return mapCallResult(result);
  },
};

const accountsCheckpoints: ToolDef = {
  name: 'finance.accounts.checkpoints',
  description:
    "List an account's balance checkpoints, newest first — each a balance read off " +
    'something outside the ledger (a statement, a bank app, a hand count). ' +
    'expectedBalanceCents/deltaCents are what the ledger predicted for that checkpoint and ' +
    'by how much it disagreed, so a nonzero deltaCents names a gap (a missing or ' +
    'duplicated transaction); both are null for the earliest checkpoint, which anchors the ' +
    `account rather than being measured against it. ${LEDGER_SIGN_NOTE}`,
  inputSchema: {
    type: 'object',
    properties: { accountId: { type: 'string', description: 'Account ID' } },
    required: ['accountId'],
  },
  handler: async (args) => {
    const accountId = reqStr(args, 'accountId');
    if (!accountId) return toolError('Missing required field: accountId');
    return mapCallResult(await finance().checkpoints.list({ id: accountId }));
  },
};

export const accountsTools: readonly ToolDef[] = [accountsList, accountsCheckpoints];

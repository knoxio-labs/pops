import { accountsTools } from './finance-accounts.js';
import { ENTITY_TYPES, contacts, finance, type EntityType } from './finance-client.js';
import { correctionsTools } from './finance-corrections.js';
import { importsTools } from './finance-imports.js';
import { searchTools } from './finance-search.js';
import { wishlistTools } from './finance-wishlist.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const transactionsList: ToolDef = {
  name: 'finance.transactions.list',
  description:
    'List financial transactions. Filter by date range, entity, account, type, or free-text search.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search in transaction description' },
      startDate: { type: 'string', description: 'Start date (ISO 8601, e.g. "2025-01-01")' },
      endDate: { type: 'string', description: 'End date (ISO 8601, e.g. "2025-12-31")' },
      entityId: { type: 'string', description: 'Filter by entity (merchant) ID' },
      account: { type: 'string', description: 'Filter by account name' },
      type: {
        type: 'string',
        enum: ['income', 'expense', 'transfer'],
        description: 'Transaction type',
      },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await finance().transactions.list({
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      startDate: typeof args['startDate'] === 'string' ? args['startDate'] : undefined,
      endDate: typeof args['endDate'] === 'string' ? args['endDate'] : undefined,
      entityId: typeof args['entityId'] === 'string' ? args['entityId'] : undefined,
      account: typeof args['account'] === 'string' ? args['account'] : undefined,
      type:
        args['type'] === 'income' || args['type'] === 'expense' || args['type'] === 'transfer'
          ? args['type']
          : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return mapCallResult(result);
  },
};

const transactionsGet: ToolDef = {
  name: 'finance.transactions.get',
  description: 'Get a single financial transaction by ID.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Transaction ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await finance().transactions.get({ id }));
  },
};

const entitiesList: ToolDef = {
  name: 'finance.entities.list',
  description:
    'List finance entities (merchants, businesses). Entities are matched to transactions during import.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search by entity name' },
      type: { type: 'string', enum: ENTITY_TYPES, description: 'Filter by entity type' },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await contacts().entities.list({
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      type: (ENTITY_TYPES as readonly string[]).includes(args['type'] as string)
        ? (args['type'] as EntityType)
        : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return mapCallResult(result);
  },
};

const budgetsList: ToolDef = {
  name: 'finance.budgets.list',
  description: 'List budgets with current spend. Supports filtering by period and active state.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search by budget name' },
      period: {
        type: 'string',
        enum: ['monthly', 'yearly'],
        description: 'Filter by budget period',
      },
      active: { type: 'string', enum: ['true', 'false'], description: 'Filter by active state' },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await finance().budgets.list({
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      period:
        args['period'] === 'monthly' || args['period'] === 'yearly' ? args['period'] : undefined,
      active: args['active'] === 'true' || args['active'] === 'false' ? args['active'] : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return mapCallResult(result);
  },
};

const budgetsGet: ToolDef = {
  name: 'finance.budgets.get',
  description: 'Get a single budget by ID, including current spend and remaining amount.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Budget ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await finance().budgets.get({ id }));
  },
};

export const financeTools: readonly ToolDef[] = [
  transactionsList,
  transactionsGet,
  entitiesList,
  budgetsList,
  budgetsGet,
  ...correctionsTools,
  ...wishlistTools,
  ...accountsTools,
  ...importsTools,
  ...searchTools,
];

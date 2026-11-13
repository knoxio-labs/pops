import { beforeEach, expect, it, vi } from 'vitest';

import { callOk, callUnavailable, extractText } from './test-helpers.js';

const { getPillarMock, operations } = vi.hoisted(() => {
  const operations = {
    catalogue: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    reference: vi.fn(),
  };
  return { getPillarMock: vi.fn(() => ({ entities: operations })), operations };
});
vi.mock('../pillar-client.js', () => ({ getPillar: getPillarMock }));
const { contactsTools } = await import('./contacts.js');
const entity = {
  id: 'opaque-owner-id',
  name: 'Fictional owner contact',
  type: 'person',
  aliases: [],
  defaultTags: [],
  lastEditedTime: 'owner timestamp',
};
const reference = { canonicalId: 'retained-owner', uri: 'pops:contacts/contact/retained-owner' };
function tool(operation: string) {
  const found = contactsTools.find(({ name }) => name === `contacts.entities.${operation}`);
  if (!found) throw new Error(`Missing canonical Contacts adapter: ${operation}`);
  return found;
}

function validInput(operation: keyof typeof operations): Record<string, unknown> {
  if (operation === 'create') return { name: 'Fictional Contact' };
  if (operation === 'get' || operation === 'reference') return { id: 'owner' };
  return {};
}
beforeEach(() => {
  vi.clearAllMocks();
  operations.catalogue.mockResolvedValue(callOk({ types: ['person'], defaultType: 'person' }));
  operations.list.mockResolvedValue(
    callOk({ data: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } })
  );
  operations.get.mockResolvedValue(callOk({ data: entity }));
  operations.create.mockResolvedValue(callOk({ data: entity, message: 'Entity created' }));
  operations.reference.mockResolvedValue(callOk(reference));
});

it('exposes only five finite Contacts operations with exact owner scopes and create as the only write', () => {
  expect(contactsTools.map(({ name }) => name)).toEqual(
    ['catalogue', 'list', 'get', 'create', 'reference'].map((id) => `contacts.entities.${id}`)
  );
  for (const definition of contactsTools) {
    expect(definition.scope).toBe(definition.name);
    expect(definition.readOnly).toBe(definition.name !== 'contacts.entities.create');
    expect(definition.inputSchema.additionalProperties).toBe(false);
  }
});

it.each<{ operation: keyof typeof operations; input: Record<string, unknown> }>([
  { operation: 'catalogue', input: {} },
  {
    operation: 'list',
    input: {
      excludePersons: false,
      search: '  Owner text  ',
      type: 'owner-defined-new-type',
      limit: -3,
      offset: 0,
    },
  },
  { operation: 'get', input: { id: 'opaque-owner-id' } },
  {
    operation: 'create',
    input: {
      name: '  Fictional Contact  ',
      type: 'person',
      aliases: ['Alias'],
      defaultTags: [],
      notes: null,
    },
  },
  { operation: 'reference', input: { id: 'historical-owner-id' } },
])('routes $operation only to its owner with verbatim flat input', async ({ operation, input }) => {
  const result = await tool(operation).handler(input);
  expect(result.isError).not.toBe(true);
  expect(getPillarMock).toHaveBeenCalledExactlyOnceWith('contacts');
  expect(operations[operation]).toHaveBeenCalledExactlyOnceWith(input);
});

it('preserves the owner catalogue instead of copying types or defaulting a create', async () => {
  const catalogue = { types: ['future-owner-kind', 'person'], defaultType: 'future-owner-kind' };
  operations.catalogue.mockResolvedValue(callOk(catalogue));
  expect(JSON.parse(extractText(await tool('catalogue').handler({})))).toEqual(catalogue);
  await tool('create').handler({ name: 'No consumer default' });
  expect(operations.create).toHaveBeenCalledExactlyOnceWith({ name: 'No consumer default' });
});

it.each([
  { operation: 'catalogue', input: { type: 'person' } },
  { operation: 'get', input: {} },
  { operation: 'reference', input: { id: 7 } },
  { operation: 'list', input: { excludePersons: 'true' } },
  { operation: 'list', input: { limit: 1.5 } },
  { operation: 'list', input: { invent: 'filter' } },
  { operation: 'create', input: {} },
  { operation: 'create', input: { name: 'Contact', colour: 'red' } },
  { operation: 'create', input: { name: 'Contact', aliases: [7] } },
  { operation: 'create', input: { name: 'Contact', defaultTags: null } },
  { operation: 'create', input: { name: 'Contact', type: 7 } },
])(
  'rejects malformed $operation arguments before owner dispatch: $input',
  async ({ operation, input }) => {
    expect((await tool(operation).handler(input)).isError).toBe(true);
    expect(getPillarMock).not.toHaveBeenCalled();
  }
);

it.each(['unavailable', 'unauthorized', 'not-found', 'conflict', 'bad-request'] as const)(
  'preserves an owner %s failure rather than reporting a fabricated reference',
  async (kind) => {
    operations.reference.mockResolvedValue(
      kind === 'unavailable'
        ? callUnavailable('contacts')
        : { kind, pillar: 'contacts', message: `Owner ${kind}` }
    );
    const result = await tool('reference').handler({ id: 'requested' });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain(
      kind === 'unavailable' ? "Pillar 'contacts' is unavailable" : `Owner ${kind}`
    );
    if (kind === 'unauthorized')
      expect(extractText(result)).toContain("scope 'contacts.entities.reference'");
    expect(extractText(result)).not.toContain('pops:contacts/contact/requested');
  }
);

it('returns the exact owner-issued canonical reference after historical identity resolution', async () => {
  const result = await tool('reference').handler({ id: 'historical-owner-id' });
  expect(JSON.parse(extractText(result))).toEqual(reference);
  expect(operations.reference).toHaveBeenCalledExactlyOnceWith({ id: 'historical-owner-id' });
  expect(operations.get).not.toHaveBeenCalled();
});

it.each([
  null,
  {},
  { canonicalId: 'retained-owner', uri: 'pops:contacts/contact/other' },
  { canonicalId: 'retained-owner', uri: 'pops:trips/person/retained-owner' },
  { canonicalId: '', uri: 'pops:contacts/contact/' },
])('does not turn malformed owner proof %j into a successful reference', async (value) => {
  operations.reference.mockResolvedValue(callOk(value));
  expect((await tool('reference').handler({ id: 'requested' })).isError).toBe(true);
});

it.each(['catalogue', 'list', 'get', 'create', 'reference'] as const)(
  'reports the exact producer scope after %s authorization refusal',
  async (operation) => {
    operations[operation].mockResolvedValue({
      kind: 'unauthorized',
      pillar: 'contacts',
      message: 'Denied by owner',
    });
    const input = validInput(operation);
    const result = await tool(operation).handler(input);
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain(`scope 'contacts.entities.${operation}'`);
  }
);

it.each(['catalogue', 'list', 'get', 'create', 'reference'] as const)(
  'rejects a malformed successful %s owner response',
  async (operation) => {
    operations[operation].mockResolvedValue(callOk({ wrong: 'shape' }));
    const input = validInput(operation);
    expect((await tool(operation).handler(input)).isError).toBe(true);
  }
);

it('preserves a canonical owner row returned by get for a historical id without adding a guessed URI', async () => {
  const response = { data: { ...entity, id: 'retained-owner' } };
  operations.get.mockResolvedValue(callOk(response));
  expect(JSON.parse(extractText(await tool('get').handler({ id: 'historical-owner-id' })))).toEqual(
    response
  );
});

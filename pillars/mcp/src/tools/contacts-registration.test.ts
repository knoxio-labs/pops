import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, expect, it, vi } from 'vitest';

import { callOk } from './test-helpers.js';

const { getPillarMock, entities } = vi.hoisted(() => {
  const entities = {
    catalogue: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    reference: vi.fn(),
  };
  return { getPillarMock: vi.fn((_pillarId: string) => ({ entities })), entities };
});
vi.mock('../pillar-client.js', () => ({ getPillar: getPillarMock }));
vi.mock('dotenv', () => ({ config: vi.fn() }));

const { createMcpServer } = await import('../index.js');
const names = [
  'contacts.entities.catalogue',
  'contacts.entities.create',
  'contacts.entities.get',
  'contacts.entities.list',
  'contacts.entities.reference',
];
const entity = {
  id: 'owner-issued-contact',
  name: 'Fictional contact',
  type: 'person',
  aliases: [],
  defaultTags: [],
  lastEditedTime: 'owner timestamp',
};

beforeEach(() => {
  vi.clearAllMocks();
  entities.catalogue.mockResolvedValue(callOk({ types: ['person'], defaultType: 'person' }));
  entities.create.mockResolvedValue(callOk({ data: entity, message: 'Entity created' }));
  entities.reference.mockResolvedValue(
    callOk({
      canonicalId: entity.id,
      uri: `pops:contacts/contact/${entity.id}`,
    })
  );
});

async function withGateway(run: (client: Client) => Promise<void>): Promise<void> {
  const server = createMcpServer();
  const client = new Client({ name: 'contacts-registration-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    try {
      await client.close();
    } finally {
      await server.close();
    }
  }
}

it('lists all five Contacts tools through the actual MCP server with exact scopes and annotations', async () => {
  await withGateway(async (client) => {
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(203);
    const contacts = listed.tools.filter((tool) => tool.name.startsWith('contacts.'));
    expect(contacts.map((tool) => tool.name).toSorted()).toEqual(names);
    for (const tool of contacts) {
      expect(tool.description).toContain(`Requires service-account scope '${tool.name}'.`);
      expect(tool.annotations?.readOnlyHint).toBe(tool.name !== 'contacts.entities.create');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
    expect(getPillarMock).not.toHaveBeenCalled();
  });
});

it('routes real MCP catalogue/create/reference calls to the owner without inserting a type or guessing identity', async () => {
  const catalogue = { types: ['future-owner-kind', 'person'], defaultType: 'future-owner-kind' };
  entities.catalogue.mockResolvedValue(callOk(catalogue));
  await withGateway(async (client) => {
    const read = CallToolResultSchema.parse(
      await client.callTool({ name: 'contacts.entities.catalogue', arguments: {} })
    );
    expect(read.content).toEqual([{ type: 'text', text: JSON.stringify(catalogue) }]);
    const created = CallToolResultSchema.parse(
      await client.callTool({ name: 'contacts.entities.create', arguments: { name: entity.name } })
    );
    expect(created.isError).not.toBe(true);
    expect(entities.create).toHaveBeenCalledExactlyOnceWith({ name: entity.name });
    const reference = CallToolResultSchema.parse(
      await client.callTool({
        name: 'contacts.entities.reference',
        arguments: { id: 'historical-owner-id' },
      })
    );
    expect(reference.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({ canonicalId: entity.id, uri: `pops:contacts/contact/${entity.id}` }),
      },
    ]);
    expect(entities.reference).toHaveBeenCalledExactlyOnceWith({ id: 'historical-owner-id' });
    expect(getPillarMock).toHaveBeenCalledTimes(3);
    expect(getPillarMock.mock.calls.every(([id]) => id === 'contacts')).toBe(true);
  });
});

it.each([
  { name: 'contacts.entities.create', arguments: { name: 'Fictional', extra: true } },
  { name: 'contacts.entities.create', arguments: {} },
  { name: 'contacts.entities.reference', arguments: { id: 7 } },
  { name: 'contacts.entities.delete', arguments: { id: 'owner-issued-contact' } },
])('rejects malformed or unregistered MCP calls before owner dispatch: $name', async (request) => {
  await withGateway(async (client) => {
    const result = CallToolResultSchema.parse(await client.callTool(request));
    expect(result.isError).toBe(true);
    expect(getPillarMock).not.toHaveBeenCalled();
  });
});

it('preserves an owner create authorization refusal with its exact grant and no automatic retry', async () => {
  entities.create.mockResolvedValue({
    kind: 'unauthorized',
    pillar: 'contacts',
    message: 'Owner refused create',
  });
  await withGateway(async (client) => {
    const result = CallToolResultSchema.parse(
      await client.callTool({ name: 'contacts.entities.create', arguments: { name: entity.name } })
    );
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: expect.stringContaining("scope 'contacts.entities.create'") },
    ]);
    expect(entities.create).toHaveBeenCalledExactlyOnceWith({ name: entity.name });
  });
});

it('does not automatically resend an unconfirmed owner create or return a fabricated contact', async () => {
  entities.create.mockResolvedValue({ kind: 'unavailable', pillar: 'contacts' });
  await withGateway(async (client) => {
    const result = CallToolResultSchema.parse(
      await client.callTool({ name: 'contacts.entities.create', arguments: { name: entity.name } })
    );
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: expect.stringContaining("Pillar 'contacts' is unavailable") },
    ]);
    expect(entities.create).toHaveBeenCalledTimes(1);
    expect(entities.reference).not.toHaveBeenCalled();
    expect(entities.get).not.toHaveBeenCalled();
  });
});

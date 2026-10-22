import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUploadTokenStore } from '../uploads/upload-tokens.js';
import { callOk, callUnavailable, extractText, parseResult } from './test-helpers.js';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { UploadTokenStore } from '../uploads/upload-tokens.js';
import type { ToolDef } from './tool-def.js';

const inventory = {
  documents: {
    listForItem: vi.fn(),
    link: vi.fn(),
    update: vi.fn(),
    unlink: vi.fn(),
    dismissIngestion: vi.fn(),
    listForPaperlessDocument: vi.fn(),
  },
  paperless: { search: vi.fn(), status: vi.fn() },
};
const documents = { write: { delete: vi.fn() } };

vi.mock('../pillar-client.js', () => ({
  getPillar: (id: string) => {
    if (id === 'inventory') return inventory;
    if (id === 'documents') return documents;
    throw new Error(`No mock pillar handle for '${id}'`);
  },
  __resetPillarClientForTests: () => {},
}));

const { documentTools } = await import('./documents.js');
const { documentCreateUploadTool, documentCurlCommand } =
  await import('./inventory-documents-upload.js');

function tool(name: string): ToolDef {
  const found = documentTools.find((entry) => entry.name === name);
  if (!found) throw new Error(`Tool not found: ${name}`);
  return found;
}

const unauthorized: CallResult<never> = {
  kind: 'unauthorized',
  pillar: 'inventory',
  message: 'Missing scope',
};

const LINK = { id: 3, itemId: 'item_1', paperlessDocumentId: 42, documentType: 'receipt' };
const LIMITS = { data: { maxUploadBytes: 104857600, allowedMimeTypes: ['application/pdf'] } };

beforeEach(() => {
  vi.clearAllMocks();
  inventory.documents.listForItem.mockResolvedValue(
    callOk({ data: [{ ...LINK, missing: false }], pending: [], failed: [], pagination: {} })
  );
  inventory.documents.link.mockResolvedValue(callOk({ data: LINK, message: 'linked' }));
  inventory.documents.update.mockResolvedValue(callOk({ data: LINK, message: 'updated' }));
  inventory.documents.unlink.mockResolvedValue(callOk({ message: 'unlinked' }));
  inventory.documents.dismissIngestion.mockResolvedValue(callOk({ message: 'dismissed' }));
  inventory.paperless.search.mockResolvedValue(
    callOk({
      data: [
        {
          id: 42,
          title: 'Receipt',
          created: '2026-01-01',
          originalFileName: 'r.pdf',
          thumbnailUrl: '/x',
        },
      ],
    })
  );
  inventory.paperless.status.mockResolvedValue(callOk(LIMITS));
  inventory.documents.listForPaperlessDocument.mockResolvedValue(callOk({ data: [] }));
  documents.write.delete.mockResolvedValue(callOk(undefined));
});

describe('registration', () => {
  it('registers every document tool once, writes marked as writes, each with a scope', () => {
    const expected = {
      'documents.search': true,
      'inventory.documents.list': true,
      'inventory.documents.createUpload': false,
      'inventory.documents.link': false,
      'inventory.documents.update': false,
      'inventory.documents.unlink': false,
      'inventory.documents.dismissFailed': false,
      'documents.delete': false,
    };
    expect(Object.fromEntries(documentTools.map((t) => [t.name, t.readOnly]))).toEqual(expected);
    for (const entry of documentTools) expect(entry.scope, entry.name).toBeDefined();
  });
});

describe('documents.search', () => {
  it("searches through inventory's pass-through and keeps only the documented fields", async () => {
    const result = await tool('documents.search').handler({ query: 'receipt' });
    expect(inventory.paperless.search).toHaveBeenCalledWith({ query: 'receipt' });
    expect(parseResult(result)).toEqual({
      data: [{ id: 42, title: 'Receipt', created: '2026-01-01', originalFileName: 'r.pdf' }],
    });
  });

  it('refuses a missing query without calling the pillar', async () => {
    expect((await tool('documents.search').handler({})).isError).toBe(true);
    expect(inventory.paperless.search).not.toHaveBeenCalled();
  });

  it('names the scope when inventory refuses the credential', async () => {
    inventory.paperless.search.mockResolvedValueOnce(unauthorized);
    const result = await tool('documents.search').handler({ query: 'receipt' });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("'inventory.paperless.search'");
  });
});

describe('inventory.documents.list', () => {
  it('returns linked, pending and failed entries with the item page path on each link', async () => {
    const result = await tool('inventory.documents.list').handler({ itemId: 'item 1', limit: 5 });
    expect(inventory.documents.listForItem).toHaveBeenCalledWith({ itemId: 'item 1', limit: 5 });
    expect(parseResult(result)).toMatchObject({
      itemUri: 'pops:inventory/item/item 1',
      webPath: '/inventory/items/item%201',
      data: [{ ...LINK, missing: false, webPath: '/inventory/items/item%201' }],
      pending: [],
      failed: [],
    });
  });

  it('refuses a missing itemId without calling the pillar', async () => {
    expect((await tool('inventory.documents.list').handler({})).isError).toBe(true);
    expect(inventory.documents.listForItem).not.toHaveBeenCalled();
  });

  it('maps an unavailable pillar to an error', async () => {
    inventory.documents.listForItem.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('inventory.documents.list').handler({ itemId: 'item_1' });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('unavailable');
  });
});

describe('inventory.documents.createUpload', () => {
  let tokens: UploadTokenStore;
  let createUpload: ToolDef;
  const context = { publicBaseUrl: 'https://mcp.example' };

  beforeEach(() => {
    tokens = createUploadTokenStore();
    createUpload = documentCreateUploadTool(tokens);
  });

  it("mints a document URL carrying documents' limits and returns the curl line", async () => {
    const result = await createUpload.handler(
      { itemId: 'item_1', documentType: 'warranty', fileName: 'w.pdf', title: 'Warranty' },
      context
    );
    const body = parseResult(result);
    if (typeof body !== 'object' || body === null || !('uploadUrl' in body)) {
      throw new Error('no uploadUrl');
    }
    const uploadUrl = String(body.uploadUrl);
    expect(uploadUrl).toMatch(/^https:\/\/mcp\.example\/uploads\/[A-Za-z0-9_-]{43}$/u);
    expect(body).toMatchObject({
      method: 'PUT',
      maxBytes: 104857600,
      allowedMimeTypes: ['application/pdf'],
      command: `curl -T <file> -H 'Content-Type: application/pdf' '${uploadUrl}'`,
    });
    expect(tokens.consume(uploadUrl.split('/').at(-1) ?? '')).toEqual({
      kind: 'document',
      itemId: 'item_1',
      documentType: 'warranty',
      fileName: 'w.pdf',
      title: 'Warranty',
      maxBytes: 104857600,
      allowedMimeTypes: ['application/pdf'],
    });
  });

  it('coerces an unknown documentType to other', async () => {
    const mint = vi.spyOn(tokens, 'mint');
    await createUpload.handler(
      { itemId: 'item_1', documentType: 'tax-return', fileName: 'x.pdf' },
      context
    );
    expect(mint.mock.calls[0]?.[0]).toMatchObject({ kind: 'document', documentType: 'other' });
  });

  it.each([
    [{ documentType: 'receipt', fileName: 'r.pdf' }, 'itemId'],
    [{ itemId: 'item_1', documentType: 'receipt' }, 'fileName'],
    [{ itemId: 'item_1', documentType: 'receipt', fileName: '' }, 'fileName'],
  ])('refuses %o (missing %s) before asking documents', async (args, field) => {
    const result = await createUpload.handler(args, context);
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain(field);
    expect(inventory.paperless.status).not.toHaveBeenCalled();
  });

  it('refuses without a public address and mints nothing', async () => {
    const mint = vi.spyOn(tokens, 'mint');
    const result = await createUpload.handler({ itemId: 'i', documentType: 'x', fileName: 'f' });
    expect(result.isError).toBe(true);
    expect(mint).not.toHaveBeenCalled();
  });

  it("names inventory's status scope when inventory refuses the credential", async () => {
    inventory.paperless.status.mockResolvedValueOnce({ ...unauthorized, pillar: 'inventory' });
    const mint = vi.spyOn(tokens, 'mint');
    const result = await createUpload.handler(
      { itemId: 'i', documentType: 'receipt', fileName: 'f.pdf' },
      context
    );
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("'inventory.paperless.status'");
    expect(mint).not.toHaveBeenCalled();
  });

  it('refuses and mints nothing when documents reported no limits', async () => {
    inventory.paperless.status.mockResolvedValueOnce(
      callOk({ data: { maxUploadBytes: null, allowedMimeTypes: null } })
    );
    const mint = vi.spyOn(tokens, 'mint');
    const result = await createUpload.handler(
      { itemId: 'i', documentType: 'receipt', fileName: 'f.pdf' },
      context
    );
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('upload limits are unknown');
    expect(mint).not.toHaveBeenCalled();
  });

  it('refuses when too many URLs are outstanding', async () => {
    vi.spyOn(tokens, 'mint').mockReturnValueOnce(undefined);
    const result = await createUpload.handler(
      { itemId: 'i', documentType: 'receipt', fileName: 'f.pdf' },
      context
    );
    expect(result.isError).toBe(true);
  });

  it('leaves a placeholder MIME type for an unknown extension', () => {
    expect(documentCurlCommand('https://u', 'notes')).toBe(
      "curl -T <file> -H 'Content-Type: <mime-type>' 'https://u'"
    );
    expect(documentCurlCommand('https://u', 'SCAN.JPG')).toContain("'Content-Type: image/jpeg'");
  });
});

describe('inventory.documents.link', () => {
  it('links with the given kind and title', async () => {
    await tool('inventory.documents.link').handler({
      itemId: 'item_1',
      paperlessDocumentId: 42,
      documentType: 'manual',
      title: 'Manual',
    });
    expect(inventory.documents.link).toHaveBeenCalledWith({
      itemId: 'item_1',
      paperlessDocumentId: 42,
      documentType: 'manual',
      title: 'Manual',
    });
  });

  it('coerces an unknown documentType to other', async () => {
    await tool('inventory.documents.link').handler({
      itemId: 'item_1',
      paperlessDocumentId: 42,
      documentType: 'bogus',
    });
    expect(inventory.documents.link).toHaveBeenCalledWith({
      itemId: 'item_1',
      paperlessDocumentId: 42,
      documentType: 'other',
    });
  });

  it.each([
    { paperlessDocumentId: 42, documentType: 'receipt' },
    { itemId: 'item_1', documentType: 'receipt' },
    { itemId: 'item_1', paperlessDocumentId: 0, documentType: 'receipt' },
    { itemId: 'item_1', paperlessDocumentId: 1.5, documentType: 'receipt' },
    { itemId: 'item_1', paperlessDocumentId: '42', documentType: 'receipt' },
  ])('refuses %o without calling the pillar', async (args) => {
    expect((await tool('inventory.documents.link').handler(args)).isError).toBe(true);
    expect(inventory.documents.link).not.toHaveBeenCalled();
  });

  it('maps a conflict through mapCallResult', async () => {
    inventory.documents.link.mockResolvedValueOnce({
      kind: 'conflict',
      pillar: 'inventory',
      message: 'Already linked',
    });
    const result = await tool('inventory.documents.link').handler({
      itemId: 'item_1',
      paperlessDocumentId: 42,
      documentType: 'receipt',
    });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('Already linked');
  });
});

describe('inventory.documents.update', () => {
  it('sends only the keys given', async () => {
    await tool('inventory.documents.update').handler({ id: 3, title: 'New' });
    expect(inventory.documents.update).toHaveBeenCalledWith({ id: 3, title: 'New' });
    await tool('inventory.documents.update').handler({ id: 3, documentType: 'invoice' });
    expect(inventory.documents.update).toHaveBeenLastCalledWith({ id: 3, documentType: 'invoice' });
  });

  it('coerces an unknown documentType to other', async () => {
    await tool('inventory.documents.update').handler({ id: 3, documentType: 'nope' });
    expect(inventory.documents.update).toHaveBeenCalledWith({ id: 3, documentType: 'other' });
  });

  it.each([{}, { id: 'x', title: 'a' }, { id: -1, title: 'a' }, { id: 3 }])(
    'refuses %o without calling the pillar',
    async (args) => {
      expect((await tool('inventory.documents.update').handler(args)).isError).toBe(true);
      expect(inventory.documents.update).not.toHaveBeenCalled();
    }
  );

  it('maps a Paperless failure through mapCallResult with the scope on refusal', async () => {
    inventory.documents.update.mockResolvedValueOnce(unauthorized);
    const result = await tool('inventory.documents.update').handler({ id: 3, title: 'a' });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("'inventory.documents.update'");
  });
});

describe.each([
  ['inventory.documents.unlink', 'id', () => inventory.documents.unlink],
  ['inventory.documents.dismissFailed', 'ingestionId', () => inventory.documents.dismissIngestion],
])('%s', (name, key, call) => {
  it('passes the id flat', async () => {
    await tool(name).handler({ [key]: 9 });
    expect(call()).toHaveBeenCalledWith({ id: 9 });
  });

  it.each([{}, { [key]: 0 }, { [key]: '9' }])(
    'refuses %o without calling the pillar',
    async (args) => {
      expect((await tool(name).handler(args)).isError).toBe(true);
      expect(call()).not.toHaveBeenCalled();
    }
  );

  it('maps a not-found through mapCallResult', async () => {
    call().mockResolvedValueOnce({
      kind: 'not-found',
      pillar: 'inventory',
      message: 'No such row',
    });
    const result = await tool(name).handler({ [key]: 9 });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('No such row');
  });
});

describe('documents.delete', () => {
  const linkedTwice = callOk({
    data: [
      { id: 3, itemId: 'item_1', documentType: 'receipt', title: null },
      { id: 8, itemId: 'item_2', documentType: 'manual', title: 'Manual' },
    ],
  });

  it('refuses while items link the document, naming each link', async () => {
    inventory.documents.listForPaperlessDocument.mockResolvedValue(linkedTwice);
    for (const args of [{ paperlessDocumentId: 42 }, { paperlessDocumentId: 42, force: false }]) {
      const result = await tool('documents.delete').handler(args);
      expect(result.isError).toBe(true);
      const text = extractText(result);
      expect(text).toContain('item item_1 (link 3)');
      expect(text).toContain('item item_2 (link 8)');
      expect(text).toContain('inventory.documents.unlink');
    }
    expect(inventory.documents.listForPaperlessDocument).toHaveBeenCalledWith({
      paperlessDocumentId: 42,
    });
    expect(documents.write.delete).not.toHaveBeenCalled();
  });

  it('deletes from Paperless through documents when no item links it', async () => {
    const result = await tool('documents.delete').handler({ paperlessDocumentId: 42 });
    expect(inventory.documents.listForPaperlessDocument).toHaveBeenCalledWith({
      paperlessDocumentId: 42,
    });
    expect(documents.write.delete).toHaveBeenCalledWith({ id: 42 });
    expect(parseResult(result)).toEqual({ deleted: true, paperlessDocumentId: 42 });
  });

  it('deletes with force without checking the links', async () => {
    inventory.documents.listForPaperlessDocument.mockResolvedValue(linkedTwice);
    const result = await tool('documents.delete').handler({ paperlessDocumentId: 42, force: true });
    expect(inventory.documents.listForPaperlessDocument).not.toHaveBeenCalled();
    expect(documents.write.delete).toHaveBeenCalledWith({ id: 42 });
    expect(parseResult(result)).toEqual({ deleted: true, paperlessDocumentId: 42 });
  });

  it('returns an inventory failure through mapCallResult and does not delete', async () => {
    inventory.documents.listForPaperlessDocument.mockResolvedValueOnce(unauthorized);
    const result = await tool('documents.delete').handler({ paperlessDocumentId: 42 });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("'inventory.documents.listForPaperlessDocument'");
    expect(documents.write.delete).not.toHaveBeenCalled();
  });

  it('does not delete when inventory is unreachable', async () => {
    inventory.documents.listForPaperlessDocument.mockResolvedValueOnce(
      callUnavailable('inventory')
    );
    const result = await tool('documents.delete').handler({ paperlessDocumentId: 42 });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("'inventory' is unavailable");
    expect(documents.write.delete).not.toHaveBeenCalled();
  });

  it('refuses a missing or malformed id without calling either pillar', async () => {
    for (const args of [
      { force: true },
      { paperlessDocumentId: -2 },
      { paperlessDocumentId: 1.5 },
    ]) {
      expect((await tool('documents.delete').handler(args)).isError).toBe(true);
    }
    expect(inventory.documents.listForPaperlessDocument).not.toHaveBeenCalled();
    expect(documents.write.delete).not.toHaveBeenCalled();
  });

  it("names documents' delete scope when documents refuses the credential", async () => {
    documents.write.delete.mockResolvedValueOnce({ ...unauthorized, pillar: 'documents' });
    const result = await tool('documents.delete').handler({ paperlessDocumentId: 42 });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("'documents.write.delete'");
  });
});

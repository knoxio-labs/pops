import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../inventory-api-helpers';

import type { ReactNode } from 'react';

import type { TypesReadCatalogueResponses } from '../inventory-api/types.gen';

const api = vi.hoisted(() => ({
  abandonDraft: vi.fn(),
  createDraft: vi.fn(),
  patchDraft: vi.fn(),
  previewDraft: vi.fn(),
  publishDraft: vi.fn(),
  readAudit: vi.fn(),
  readCatalogue: vi.fn(),
  readDraft: vi.fn(),
}));
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('../catalogue-editor/catalogue-api', () => ({
  catalogueApi: {
    abandonDraft: (...args: unknown[]) => api.abandonDraft(...args),
    createDraft: (...args: unknown[]) => api.createDraft(...args),
    patchDraft: (...args: unknown[]) => api.patchDraft(...args),
    previewDraft: (...args: unknown[]) => api.previewDraft(...args),
    publishDraft: (...args: unknown[]) => api.publishDraft(...args),
    readAudit: (...args: unknown[]) => api.readAudit(...args),
    readCatalogue: (...args: unknown[]) => api.readCatalogue(...args),
    readDraft: (...args: unknown[]) => api.readDraft(...args),
  },
}));

vi.mock('sonner', () => ({ toast: toasts }));

import { TypeCataloguePage } from './TypeCataloguePage';

type Catalogue = TypesReadCatalogueResponses[200];

const TYPE_ID = '11111111-1111-4111-8111-111111111111';
const FIELD_ID = '22222222-2222-4222-8222-222222222222';

const published: Catalogue = {
  revision: {
    abandoned: null,
    baseRevision: null,
    created: {
      actor: { id: null, kind: 'migration', label: 'bootstrap' },
      at: '2026-09-22T00:00:00.000Z',
    },
    minimumProtocol: 2,
    published: {
      actor: { id: null, kind: 'migration', label: 'bootstrap' },
      at: '2026-09-22T00:00:00.000Z',
      note: null,
    },
    revision: 1,
    status: 'published',
  },
  types: [
    {
      archivedAt: null,
      capabilities: [],
      description: 'Powered devices.',
      fields: [
        {
          allowOverride: false,
          archivedAt: null,
          cardinality: 'one',
          enumOptions: [],
          expression: null,
          expressionVersion: null,
          fixedUnit: null,
          help: null,
          id: FIELD_ID,
          key: 'manufacturer',
          kind: 'short_text',
          label: 'Manufacturer',
          presentation: {},
          referenceKinds: [],
          referenceTypeIds: [],
          required: false,
          sortOrder: 0,
          storage: 'stored',
          typeId: TYPE_ID,
        },
      ],
      id: TYPE_ID,
      key: 'electronics',
      label: 'Electronics',
      legacyLabels: [],
      presentation: {},
      revision: 1,
      sortOrder: 0,
    },
  ],
};

function draft(types: Catalogue['types'] = published.types): Catalogue {
  return {
    revision: {
      ...published.revision,
      baseRevision: 1,
      published: null,
      revision: 2,
      status: 'draft',
    },
    types,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPage() {
  return render(<TypeCataloguePage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.readCatalogue.mockResolvedValue({ data: published, error: undefined });
  api.readDraft.mockResolvedValue({
    data: undefined,
    error: { code: 'catalogue_draft_missing', message: 'No catalogue draft exists' },
    response: new Response(null, { status: 404 }),
  });
  api.createDraft.mockResolvedValue({ data: draft(), error: undefined });
  api.previewDraft.mockResolvedValue({
    data: {
      compatibility: {
        affectedIds: [],
        affectedItems: 0,
        changes: [],
        classification: 'compatible',
      },
    },
    error: undefined,
  });
  api.readAudit.mockResolvedValue({ data: { events: [], nextBefore: null }, error: undefined });
});

describe('TypeCataloguePage', () => {
  it('renders the persisted catalogue and its fields', async () => {
    renderPage();

    expect((await screen.findAllByText('Electronics')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to fields' }));
    expect(screen.getByText('Manufacturer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('manufacturer')).toBeDisabled();
  });

  it('creates the draft before applying the first edit', async () => {
    const createdType: Catalogue['types'][number] = {
      ...published.types[0]!,
      fields: [],
      id: '33333333-3333-4333-8333-333333333333',
      key: 'musical_instruments',
      label: 'Musical instruments',
      revision: 2,
      sortOrder: 1,
    };
    api.patchDraft.mockResolvedValue({
      data: {
        compatibility: {
          affectedIds: [createdType.id],
          affectedItems: 0,
          changes: [],
          classification: 'compatible',
        },
        draft: draft([...published.types, createdType]),
      },
      error: undefined,
    });
    renderPage();

    await screen.findAllByText('Electronics');
    fireEvent.click(screen.getByRole('button', { name: 'New type' }));
    fireEvent.change(screen.getByLabelText('Type label'), {
      target: { value: 'Musical instruments' },
    });
    expect(screen.getByLabelText('Key')).toHaveValue('musical_instruments');
    fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

    await waitFor(() =>
      expect(api.createDraft).toHaveBeenCalledWith({ body: { baseRevision: 1 } })
    );
    expect(api.patchDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          baseRevision: 1,
          operations: [expect.objectContaining({ kind: 'put_type', key: 'musical_instruments' })],
        }),
        path: { revision: 2 },
      })
    );
    expect((await screen.findAllByText('musical_instruments')).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Dry-run validation' })).toBeInTheDocument();
  });

  it('resumes an existing draft without creating another one', async () => {
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    renderPage();

    expect(await screen.findByText(/editing draft 2/)).toBeInTheDocument();
    expect(api.createDraft).not.toHaveBeenCalled();
  });

  it('previews an existing draft edit without patching it', async () => {
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), {
      target: { value: 'Previewed electronics' },
    });

    await waitFor(() =>
      expect(api.previewDraft).toHaveBeenCalledWith({
        path: { revision: 2 },
        body: {
          baseRevision: 1,
          operations: [
            expect.objectContaining({
              id: TYPE_ID,
              kind: 'put_type',
              label: 'Previewed electronics',
            }),
          ],
        },
      })
    );
    expect(api.patchDraft).not.toHaveBeenCalled();
  });

  it('does not report a failed edit as saved', async () => {
    api.createDraft.mockRejectedValue(new InventoryApiError('write failed', 400));
    renderPage();

    await screen.findAllByText('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), {
      target: { value: 'Updated electronics' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));

    await waitFor(() => expect(api.createDraft).toHaveBeenCalled());
    expect(api.patchDraft).not.toHaveBeenCalled();
    expect(toasts.success).not.toHaveBeenCalled();
    expect(await screen.findByText('write failed')).toBeInTheDocument();
  });

  it('reloads a stale draft into the open form without replaying the rejected edit', async () => {
    const recovered = draft([
      { ...published.types[0]!, label: 'Electronics recovered elsewhere', revision: 2 },
    ]);
    api.readDraft
      .mockResolvedValueOnce({ data: draft(), error: undefined })
      .mockResolvedValueOnce({ data: recovered, error: undefined });
    api.patchDraft.mockRejectedValue(
      new InventoryApiError('Draft revision is stale', 409, 'catalogue_conflict')
    );
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), {
      target: { value: 'Rejected local edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));
    expect(await screen.findByText('This draft changed elsewhere')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(await screen.findByDisplayValue('Electronics recovered elsewhere')).toBeInTheDocument();
    expect(screen.queryByText('This draft changed elsewhere')).not.toBeInTheDocument();
    expect(api.patchDraft).toHaveBeenCalledTimes(1);
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it('keeps a failed stale-draft reload recoverable through the page retry', async () => {
    const recovered = draft([
      { ...published.types[0]!, label: 'Recovered after retry', revision: 2 },
    ]);
    api.readDraft
      .mockResolvedValueOnce({ data: draft(), error: undefined })
      .mockRejectedValueOnce(new InventoryApiError('Draft reload failed', 503))
      .mockResolvedValueOnce({ data: recovered, error: undefined });
    api.patchDraft.mockRejectedValue(
      new InventoryApiError('Draft revision is stale', 409, 'catalogue_conflict')
    );
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));

    expect(await screen.findByText('Failed to load the type catalogue.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByDisplayValue('Recovered after retry')).toBeInTheDocument();
    expect(api.patchDraft).toHaveBeenCalledTimes(1);
  });
});

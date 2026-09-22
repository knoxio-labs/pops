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
  publishDraft: vi.fn(),
  readAudit: vi.fn(),
  readCatalogue: vi.fn(),
  readDraft: vi.fn(),
}));
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  typesManageAbandonDraft: (...args: unknown[]) => api.abandonDraft(...args),
  typesManageCreateDraft: (...args: unknown[]) => api.createDraft(...args),
  typesManagePatchDraft: (...args: unknown[]) => api.patchDraft(...args),
  typesManagePublishDraft: (...args: unknown[]) => api.publishDraft(...args),
  typesManageReadDraft: (...args: unknown[]) => api.readDraft(...args),
  typesReadAudit: (...args: unknown[]) => api.readAudit(...args),
  typesReadCatalogue: (...args: unknown[]) => api.readCatalogue(...args),
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
});

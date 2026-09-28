import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../inventory-api-helpers';

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
const ROUTER_TYPE_ID = '33333333-3333-4333-8333-333333333333';
const ROUTER_DEFAULT_TYPE_ID = '44444444-4444-4444-8444-444444444444';
const TYPE_A_ID = '55555555-5555-4555-8555-555555555555';
const TYPE_B_ID = '66666666-6666-4666-8666-666666666666';
const TYPE_C_ID = '77777777-7777-4777-8777-777777777777';
const TYPE_A_FIELD_ID = '88888888-8888-4888-8888-888888888888';
const TYPE_B_FIELD_ID = '99999999-9999-4999-8999-999999999999';

const published: Catalogue = {
  revision: {
    abandoned: null,
    baseRevision: null,
    created: {
      actor: { id: null, kind: 'migration', label: 'bootstrap' },
      at: '2026-09-22T00:00:00.000Z',
    },
    minimumProtocol: 2,
    draftVersion: 1,
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
          defaultValues: [],
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
          replacedBy: null,
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
      parentTypeId: null,
      presentation: {},
      replacedBy: null,
      revision: 1,
      sortOrder: 0,
    },
  ],
};

function draft(types: Catalogue['types'] = published.types, draftVersion = 1): Catalogue {
  return {
    revision: {
      ...published.revision,
      baseRevision: 1,
      draftVersion,
      published: null,
      revision: 2,
      status: 'draft',
    },
    types,
  };
}

function routeType(
  id: string,
  key: string,
  label: string,
  sortOrder: number,
  fields: Catalogue['types'][number]['fields'] = []
): Catalogue['types'][number] {
  return { ...published.types[0]!, fields, id, key, label, sortOrder };
}

function routeField(
  typeId: string,
  id: string,
  label: string
): Catalogue['types'][number]['fields'][number] {
  return { ...published.types[0]!.fields[0]!, id, label, typeId };
}

const routerCatalogue: Catalogue = {
  ...published,
  types: [
    routeType(ROUTER_TYPE_ID, 'router', 'Router', 0),
    routeType(ROUTER_DEFAULT_TYPE_ID, 'default', 'Default', 1),
  ],
};

const navigationCatalogue: Catalogue = {
  ...published,
  types: [
    routeType(TYPE_A_ID, 'type_a', 'Type A', 0, [
      routeField(TYPE_A_ID, TYPE_A_FIELD_ID, 'A field'),
    ]),
    routeType(TYPE_B_ID, 'type_b', 'Type B', 1, [
      routeField(TYPE_B_ID, TYPE_B_FIELD_ID, 'B field'),
    ]),
    routeType(TYPE_C_ID, 'type_c', 'Type C', 2),
  ],
};

function CatalogueRoute({ navigateTo }: { readonly navigateTo?: string }) {
  return (
    <>
      <TypeCataloguePage />
      <CurrentPath />
      {navigateTo === undefined ? null : <NavigationButton to={navigateTo} />}
    </>
  );
}

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function NavigationButton({ to }: { readonly to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      Navigate to requested type
    </button>
  );
}

function renderPage(initialEntry = '/inventory/types', navigateTo?: string) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/inventory/types" element={<CatalogueRoute navigateTo={navigateTo} />} />
          <Route path="/inventory/types/:id" element={<CatalogueRoute navigateTo={navigateTo} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const compatibleResult = {
  affectedIds: [],
  affectedItems: 0,
  discardedOverrides: [],
  changes: [],
  classification: 'compatible',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  api.readCatalogue.mockResolvedValue({ data: published, error: undefined });
  api.readDraft.mockResolvedValue({
    data: undefined,
    error: {
      code: 'inventory.catalogue.draft_missing',
      message: 'No catalogue draft exists',
      requestId: 'request-draft-missing',
      retryable: false,
    },
    response: new Response(null, { status: 404 }),
  });
  api.createDraft.mockResolvedValue({ data: draft(), error: undefined });
  api.previewDraft.mockResolvedValue({
    data: {
      compatibility: {
        affectedIds: [],
        affectedItems: 0,
        discardedOverrides: [],
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

  it('opens on the type named in the URL', async () => {
    api.readCatalogue.mockResolvedValue({ data: routerCatalogue, error: undefined });
    renderPage(`/inventory/types/${ROUTER_TYPE_ID}`);

    expect(await screen.findByRole('button', { name: /Router/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('an unknown type id falls back to the default type', async () => {
    api.readCatalogue.mockResolvedValue({ data: routerCatalogue, error: undefined });
    renderPage('/inventory/types/unknown');

    expect(await screen.findByRole('button', { name: /Router/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('navigating from /inventory/types/A to /inventory/types/B selects B', async () => {
    api.readCatalogue.mockResolvedValue({ data: navigationCatalogue, error: undefined });
    renderPage(`/inventory/types/${TYPE_A_ID}`, `/inventory/types/${TYPE_B_ID}`);

    expect(await screen.findByRole('button', { name: /Type A/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: /Type C/ }));
    expect(screen.getByRole('button', { name: /Type C/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Navigate to requested type' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Type B/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
    expect(screen.getByRole('button', { name: /Type A/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Type C/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('updates the type route when selecting a type from the catalogue', async () => {
    api.readCatalogue.mockResolvedValue({ data: navigationCatalogue, error: undefined });
    renderPage('/inventory/types');

    await screen.findByRole('button', { name: /Type A/ });
    fireEvent.click(screen.getByRole('button', { name: /Type B/ }));

    await waitFor(() =>
      expect(screen.getByTestId('current-path')).toHaveTextContent(`/inventory/types/${TYPE_B_ID}`)
    );
  });

  it('resets the editor state when navigating from type A to type B', async () => {
    api.readCatalogue.mockResolvedValue({ data: navigationCatalogue, error: undefined });
    renderPage(`/inventory/types/${TYPE_A_ID}`, `/inventory/types/${TYPE_B_ID}`);

    expect(await screen.findByRole('button', { name: /Type A/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue to fields' }));
    expect(await screen.findByDisplayValue('A field')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Navigate to requested type' }));

    await waitFor(() => expect(screen.getByDisplayValue('Type B')).toBeInTheDocument());
    expect(screen.queryByText('Choose a field')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Type B/ })).toHaveAttribute('aria-pressed', 'true');
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
          discardedOverrides: [],
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
          expectedDraftVersion: 1,
          operations: [expect.objectContaining({ kind: 'put_type', key: 'musical_instruments' })],
        }),
        path: { revision: 2 },
      })
    );
    expect((await screen.findAllByText('musical_instruments')).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Dry-run validation' })).toBeInTheDocument();
  });

  it('uses the minted parent id for a child in the next draft patch', async () => {
    const parentType: Catalogue['types'][number] = {
      ...published.types[0]!,
      fields: [],
      id: '33333333-3333-4333-8333-333333333333',
      key: 'bedding',
      label: 'Bedding',
      parentTypeId: null,
      revision: 2,
      sortOrder: 1,
    };
    const childType: Catalogue['types'][number] = {
      ...parentType,
      id: '44444444-4444-4444-8444-444444444444',
      key: 'sheets',
      label: 'Sheets',
      parentTypeId: parentType.id,
      revision: 2,
      sortOrder: 2,
    };
    api.patchDraft
      .mockResolvedValueOnce({
        data: {
          compatibility: compatibleResult,
          draft: draft([...published.types, parentType], 2),
        },
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: {
          compatibility: compatibleResult,
          draft: draft([...published.types, parentType, childType], 3),
        },
        error: undefined,
      });
    renderPage();

    await screen.findAllByText('Electronics');
    fireEvent.click(screen.getByRole('button', { name: 'New type' }));
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Bedding' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create type' }));
    await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'New type' }));
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Sheets' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Parent' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bedding' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

    await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(2));
    expect(api.patchDraft).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: expect.objectContaining({
          operations: [expect.objectContaining({ kind: 'put_type', parentTypeId: parentType.id })],
        }),
        path: { revision: 2 },
      })
    );
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
          expectedDraftVersion: 1,
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
      new InventoryApiError('Draft revision is stale', 409, 'inventory.catalogue.conflict')
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
      new InventoryApiError('Draft revision is stale', 409, 'inventory.catalogue.conflict')
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

  it('sends each edit against the draft version the previous edit returned', async () => {
    const renamed = (label: string, version: number) =>
      draft([{ ...published.types[0]!, label, revision: 2 }], version);
    api.readDraft.mockResolvedValue({ data: draft(published.types, 4), error: undefined });
    api.patchDraft
      .mockResolvedValueOnce({
        data: { compatibility: compatibleResult, draft: renamed('First save', 5) },
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: { compatibility: compatibleResult, draft: renamed('Second save', 6) },
        error: undefined,
      });
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'First save' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));
    await screen.findByDisplayValue('First save');
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Second save' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));

    await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(2));
    expect(api.patchDraft).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ body: expect.objectContaining({ expectedDraftVersion: 4 }) })
    );
    expect(api.patchDraft).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ body: expect.objectContaining({ expectedDraftVersion: 5 }) })
    );
  });

  it('reloads after losing a draft-version race and retries against the reloaded version', async () => {
    const newer = draft([{ ...published.types[0]!, label: 'Saved by another editor' }], 3);
    api.readDraft
      .mockResolvedValueOnce({ data: draft(published.types, 2), error: undefined })
      .mockResolvedValueOnce({ data: newer, error: undefined });
    api.patchDraft
      .mockResolvedValueOnce({
        data: undefined,
        error: {
          code: 'inventory.catalogue.draft_conflict',
          details: { currentDraftVersion: 3 },
          message: 'Catalogue draft 2 is at version 3, not 2',
          requestId: 'request-draft-conflict',
          retryable: false,
        },
        response: new Response(null, { status: 409 }),
      })
      .mockResolvedValueOnce({
        data: {
          compatibility: compatibleResult,
          draft: draft([{ ...published.types[0]!, label: 'Retried label' }], 4),
        },
        error: undefined,
      });
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Lost label' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));
    expect(await screen.findByText('This draft changed elsewhere')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    const reloaded = await screen.findByDisplayValue('Saved by another editor');
    fireEvent.change(reloaded, { target: { value: 'Retried label' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));

    await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(2));
    expect(api.patchDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ baseRevision: 1, expectedDraftVersion: 3 }),
      })
    );
    expect(screen.queryByText('This draft changed elsewhere')).not.toBeInTheDocument();
  });

  it('publishes only after a preview tied to the current draft, then returns to published', async () => {
    const publishedAfter: Catalogue = {
      ...published,
      revision: {
        ...published.revision,
        minimumProtocol: 2,
        published: {
          actor: { id: null, kind: 'web', label: 'Owner' },
          at: '2026-09-23T01:00:00.000Z',
          note: 'Adds a field',
        },
        revision: 2,
      },
    };
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    api.readCatalogue
      .mockResolvedValueOnce({ data: published, error: undefined })
      .mockResolvedValue({ data: publishedAfter, error: undefined });
    api.patchDraft.mockResolvedValue({
      data: { compatibility: compatibleResult, draft: draft(published.types, 2) },
      error: undefined,
    });
    api.publishDraft.mockResolvedValue({ data: publishedAfter, error: undefined });
    renderPage();

    await screen.findByDisplayValue('Electronics');
    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Electronics v2' } });
    await waitFor(() => expect(api.previewDraft).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeDisabled();
    expect(screen.getByText('Compatible (unsaved)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));
    await waitFor(() => expect(api.patchDraft).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review and publish' })).toBeEnabled()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review and publish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish revision' }));

    await waitFor(() =>
      expect(api.publishDraft).toHaveBeenCalledWith({
        path: { revision: 2 },
        body: { baseRevision: 1, expectedDraftVersion: 2, note: null, minimumProtocol: 2 },
      })
    );
    expect((await screen.findAllByText('Published revision 2')).length).toBeGreaterThan(0);
    expect(screen.getByText('No draft')).toBeInTheDocument();
    expect(toasts.success).toHaveBeenCalledWith('Catalogue published');
  });

  it('reorders a field through the outline move controls', async () => {
    const second = {
      ...published.types[0]!.fields[0]!,
      id: '44444444-4444-4444-8444-444444444444',
      key: 'model',
      label: 'Model',
      sortOrder: 1,
    };
    const typeWithFields = {
      ...published.types[0]!,
      fields: [published.types[0]!.fields[0]!, second],
    };
    api.readDraft.mockResolvedValue({ data: draft([typeWithFields]), error: undefined });
    api.patchDraft.mockResolvedValue({
      data: {
        compatibility: compatibleResult,
        draft: draft([{ ...typeWithFields, fields: [second, published.types[0]!.fields[0]!] }]),
      },
      error: undefined,
    });
    renderPage();

    await screen.findAllByText('Electronics');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to fields' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move Model up' }));

    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            operations: [
              {
                kind: 'reorder',
                definition: 'field',
                parentId: TYPE_ID,
                ids: [second.id, FIELD_ID],
              },
            ],
          }),
        })
      )
    );
  });

  it('archives a field through the confirmation dialog', async () => {
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    api.patchDraft.mockResolvedValue({
      data: {
        compatibility: compatibleResult,
        draft: draft([
          {
            ...published.types[0]!,
            fields: [{ ...published.types[0]!.fields[0]!, archivedAt: '2026-09-23T00:00:00.000Z' }],
          },
        ]),
      },
      error: undefined,
    });
    renderPage();

    await screen.findAllByText('Electronics');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to fields' }));
    fireEvent.click(await screen.findByText('Manufacturer'));
    fireEvent.click(screen.getByRole('button', { name: 'Archive field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ operations: [{ kind: 'archive_field', id: FIELD_ID }] }),
        })
      )
    );
  });

  it('surfaces a forbidden catalogue error and preserves the unsaved edit', async () => {
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    api.patchDraft.mockRejectedValue(
      new InventoryApiError('You cannot edit this catalogue', 403, 'inventory.catalogue.forbidden')
    );
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Blocked edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));

    expect(await screen.findByText('You cannot edit this catalogue')).toBeInTheDocument();
    expect(screen.queryByText('This draft changed elsewhere')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Blocked edit')).toBeInTheDocument();
  });

  it('surfaces an unavailable server error and preserves the unsaved edit', async () => {
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    api.patchDraft.mockRejectedValue(new InventoryApiError('inventory API returned no data', 503));
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Retry me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));

    expect(await screen.findByText('inventory API returned no data')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Retry me')).toBeInTheDocument();
  });

  it('surfaces structured validation issues and preserves the unsaved edit', async () => {
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    api.patchDraft.mockRejectedValue(
      new InventoryApiError('Catalogue validation failed', 400, 'catalogue_invalid', [
        {
          code: 'fixed_unit_required',
          definitionId: FIELD_ID,
          message: 'Fixed unit is required',
          path: 'fixedUnit',
        },
      ])
    );
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), {
      target: { value: 'Invalid edit kept' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));

    expect(await screen.findByText('Catalogue validation failed')).toBeInTheDocument();
    expect(screen.getByText('Fixed unit is required')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Invalid edit kept')).toBeInTheDocument();
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it('refuses to publish a draft the preview marks forbidden', async () => {
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    api.patchDraft.mockResolvedValue({
      data: {
        compatibility: {
          affectedIds: [FIELD_ID],
          affectedItems: 3,
          discardedOverrides: [],
          changes: [
            { classification: 'forbidden', code: 'field_kind_changed', definitionId: FIELD_ID },
          ],
          classification: 'forbidden',
        },
        draft: draft(published.types, 2),
      },
      error: undefined,
    });
    renderPage();

    await screen.findByDisplayValue('Electronics');
    fireEvent.change(screen.getByLabelText('Type label'), {
      target: { value: 'Destructive edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));

    await waitFor(() => expect(api.patchDraft).toHaveBeenCalled());
    expect((await screen.findAllByText('Forbidden')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeDisabled();
    expect(
      screen.getByText(
        /cannot publish without replacing the incompatible definition or supplying the explicit named migration/u
      )
    ).toBeInTheDocument();
  });

  it('edits an existing field end to end', async () => {
    api.readDraft.mockResolvedValue({ data: draft(), error: undefined });
    api.patchDraft.mockResolvedValue({
      data: {
        compatibility: compatibleResult,
        draft: draft([
          {
            ...published.types[0]!,
            fields: [{ ...published.types[0]!.fields[0]!, label: 'Manufacturer name' }],
          },
        ]),
      },
      error: undefined,
    });
    renderPage();

    await screen.findAllByText('Electronics');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to fields' }));
    fireEvent.click(await screen.findByText('Manufacturer'));
    fireEvent.change(screen.getByLabelText('Field label'), {
      target: { value: 'Manufacturer name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));

    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            operations: [
              expect.objectContaining({
                kind: 'put_field',
                id: FIELD_ID,
                label: 'Manufacturer name',
              }),
            ],
          }),
        })
      )
    );
    expect((await screen.findAllByText('Manufacturer name')).length).toBeGreaterThan(0);
  });
});

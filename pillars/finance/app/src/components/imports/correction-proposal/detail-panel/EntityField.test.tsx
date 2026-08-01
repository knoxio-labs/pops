/**
 * The entity outcome of a correction rule is a pair: `entityId` decides which
 * merchant a firing rule assigns, `entityName` is only the label shown next to
 * it. The editor used to expose the name as free text, so typing into it
 * produced a rule that read one way and applied another (or applied no merchant
 * at all). These tests pin the picker to the invariant: the pair always moves
 * together, and a pair that is already broken says so.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../../store/importStore';
import { EntityField, type EntityOutcome } from './EntityField';

import type { EntityListResponse } from '../../../../contacts-api/index.js';

const mockEntitiesList = vi.fn();
const mockToastError = vi.fn();

vi.mock('../../../../contacts-api/index.js', () => ({
  entitiesList: () => mockEntitiesList(),
}));

vi.mock('sonner', () => ({
  toast: { error: (msg: string) => mockToastError(msg), success: vi.fn(), info: vi.fn() },
}));

function dbEntities(...names: Array<[id: string, name: string]>): EntityListResponse {
  return {
    data: names.map(([id, name]) => ({
      id,
      name,
      aliases: [],
      defaultTags: [],
      type: 'company',
      lastEditedTime: '2026-01-01T00:00:00.000Z',
    })),
    pagination: { hasMore: false, limit: 50, offset: 0, total: names.length },
  };
}

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

async function renderField(value: EntityOutcome) {
  const onChange = vi.fn();
  renderWithQuery(<EntityField value={value} onChange={onChange} disabled={false} />);
  await waitFor(() => expect(mockEntitiesList).toHaveBeenCalled());
  return onChange;
}

async function openPicker() {
  await userEvent.click(screen.getByRole('combobox'));
  return screen.getByPlaceholderText('Search entities...');
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
  mockEntitiesList.mockResolvedValue({
    data: dbEntities(['ent-woolies', 'Woolworths'], ['ent-netflix', 'Netflix']),
  });
});

describe('EntityField — writing the id/name pair', () => {
  it('reports the picked entity id and its name together', async () => {
    const onChange = await renderField({ entityId: null, entityName: null });

    await openPicker();
    await userEvent.click(await screen.findByText('Netflix'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      entityId: 'ent-netflix',
      entityName: 'Netflix',
    });
  });

  it('nulls both fields when the entity is cleared', async () => {
    const onChange = await renderField({ entityId: 'ent-woolies', entityName: 'Woolworths' });

    await openPicker();
    await userEvent.click(await screen.findByText('No entity'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ entityId: null, entityName: null });
  });

  it('offers no way to type a name that is not backed by an entity', async () => {
    await renderField({ entityId: 'ent-woolies', entityName: 'Woolworths' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('EntityField — creating a merchant that does not exist yet', () => {
  it('registers a pending entity and selects it by its temp id', async () => {
    const onChange = await renderField({ entityId: null, entityName: null });

    const search = await openPicker();
    await userEvent.type(search, 'Universal Hotel');
    await userEvent.click(await screen.findByText('Create “Universal Hotel”'));

    expect(onChange).toHaveBeenCalledOnce();
    const [outcome] = onChange.mock.calls[0] as [EntityOutcome];
    expect(outcome.entityName).toBe('Universal Hotel');
    expect(outcome.entityId).toMatch(/^temp:entity:/);
    expect(useImportStore.getState().pendingEntities).toEqual([
      { tempId: outcome.entityId, name: 'Universal Hotel', type: 'company' },
    ]);
  });

  it('does not offer to create a merchant that already exists', async () => {
    await renderField({ entityId: null, entityName: null });

    const search = await openPicker();
    await userEvent.type(search, 'woolworths');

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it('does not offer creation while the entity list is still loading', async () => {
    // An incomplete list cannot answer "does this merchant exist?", so offering
    // to create one invites a duplicate of an entity we simply haven't seen.
    mockEntitiesList.mockReturnValue(new Promise(() => {}));
    await renderField({ entityId: null, entityName: null });

    const search = await openPicker();
    await userEvent.type(search, 'Universal Hotel');

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it('does not offer creation when the entity list is a partial page', async () => {
    mockEntitiesList.mockResolvedValue({
      data: {
        ...dbEntities(['ent-woolies', 'Woolworths']),
        pagination: { hasMore: true, limit: 200, offset: 0, total: 240 },
      },
    });
    await renderField({ entityId: null, entityName: null });

    const search = await openPicker();
    await userEvent.type(search, 'Universal Hotel');

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
    expect(screen.getByText(/Showing the first 1 of 240 entities/)).toBeInTheDocument();
  });
});

describe('EntityField — reporting a broken pair', () => {
  it('warns when a name carries no entity id, naming the offending label', async () => {
    await renderField({ entityId: null, entityName: 'Universal Hotel' });

    expect(await screen.findByText(/"Universal Hotel" is not a known entity/)).toBeInTheDocument();
    expect(screen.getByText(/would apply no merchant/)).toBeInTheDocument();
  });

  it('warns when the id points at an entity that no longer exists', async () => {
    await renderField({ entityId: 'ent-deleted', entityName: 'Deleted Co' });

    expect(await screen.findByText(/is not a known entity/)).toBeInTheDocument();
  });

  it('stays quiet once the id resolves', async () => {
    await renderField({ entityId: 'ent-woolies', entityName: 'Woolworths' });

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Woolworths'));
    expect(screen.queryByText(/not a known entity/)).not.toBeInTheDocument();
    expect(screen.queryByText(/only sets transaction type/)).not.toBeInTheDocument();
  });

  it('explains that an entity-less rule only sets type and location', async () => {
    await renderField({ entityId: null, entityName: null });

    expect(await screen.findByText(/only sets transaction type \/ location/)).toBeInTheDocument();
  });

  it('does not warn while the entity list is still loading', async () => {
    mockEntitiesList.mockReturnValue(new Promise(() => {}));
    await renderField({ entityId: 'ent-woolies', entityName: 'Woolworths' });

    expect(screen.queryByText(/not a known entity/)).not.toBeInTheDocument();
  });

  it('does not call an unseen id dead when the list is only a partial page', async () => {
    // The id may live on a page we never fetched; "not in the list" is not
    // evidence of a deleted entity, and warning here would cry wolf.
    mockEntitiesList.mockResolvedValue({
      data: {
        ...dbEntities(['ent-woolies', 'Woolworths']),
        pagination: { hasMore: true, limit: 200, offset: 0, total: 240 },
      },
    });
    await renderField({ entityId: 'ent-on-another-page', entityName: 'Bunnings' });

    expect(await screen.findByText(/Showing the first 1 of 240/)).toBeInTheDocument();
    expect(screen.queryByText(/not a known entity/)).not.toBeInTheDocument();
  });
});

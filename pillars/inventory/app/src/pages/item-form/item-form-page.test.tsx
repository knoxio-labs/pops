import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { blankDraft } from './form-draft';
import { deriveForm } from './form-view';
import { ItemFormPage } from './item-form-page';

import type { FormSources } from './use-form-sources';
import type { ItemFormApi } from './use-item-form';

const mocks = vi.hoisted(() => ({
  useFormSources: vi.fn(),
  useItemForm: vi.fn(),
  useChangedElsewhere: vi.fn(),
}));

vi.mock('./use-form-sources', () => ({ useFormSources: mocks.useFormSources }));
vi.mock('./use-item-form', async () => {
  const actual = await vi.importActual<typeof import('./use-item-form')>('./use-item-form');
  return { ...actual, useItemForm: mocks.useItemForm };
});
vi.mock('../../inventory-web/useChangedElsewhere.js', () => ({
  useChangedElsewhere: mocks.useChangedElsewhere,
}));

const garage = { id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const };

function sources(): FormSources {
  return {
    catalogue: {
      revision: {
        abandoned: null,
        baseRevision: null,
        created: { actor: { id: null, kind: 'web', label: null }, at: '2026-01-01' },
        draftVersion: 1,
        minimumProtocol: 1,
        published: null,
        revision: 1,
        status: 'published',
      },
      types: [],
    },
    types: [],
    world: buildWorld([], [garage]),
    recents: [],
    createLocation: vi.fn(async () => undefined),
    typeLabel: () => null,
    revision: 1,
    item: null,
    status: 'success',
    error: null,
    retry: vi.fn(),
  };
}

function api(): ItemFormApi {
  const draft = blankDraft({ kind: 'location', locationId: 'garage' });
  return {
    draft,
    initial: draft,
    view: deriveForm(draft, []),
    dispatch: vi.fn(),
    offline: false,
    saving: false,
    saveError: null,
    justCreated: null,
    cancelAsked: false,
    setCancelAsked: vi.fn(),
    requestCancel: vi.fn(),
    discard: vi.fn(),
    save: vi.fn(),
    saveAndNew: vi.fn(),
    suggestCode: vi.fn(),
    typeCode: vi.fn(),
  };
}

describe('ItemFormPage', () => {
  it('opens a blank create form with the destination from the in query', () => {
    const currentApi = api();
    mocks.useFormSources.mockReturnValue(sources());
    mocks.useItemForm.mockReturnValue(currentApi);
    mocks.useChangedElsewhere.mockReturnValue({ groups: [], stale: false, reload: vi.fn() });

    render(
      <MemoryRouter initialEntries={['/inventory/items/new?in=garage']}>
        <Routes>
          <Route path="/inventory/items/new" element={<ItemFormPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Place' })).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save and start another' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest a code' })).toBeDisabled();
  });

  it('does not render the type-specific body before a type is selected', () => {
    mocks.useFormSources.mockReturnValue(sources());
    mocks.useItemForm.mockReturnValue(api());
    mocks.useChangedElsewhere.mockReturnValue({ groups: [], stale: false, reload: vi.fn() });

    render(
      <MemoryRouter initialEntries={['/inventory/items/new']}>
        <Routes>
          <Route path="/inventory/items/new" element={<ItemFormPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByText(
        'Without a type, this item keeps its name, code, quantity, place and note. You can add a type later.'
      )
    ).toBeInTheDocument();
  });
});

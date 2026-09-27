import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { blankDraft } from './form-draft';
import { useItemForm } from './use-item-form';

import type { ReactNode } from 'react';

import type { PhotoUploads } from '../../foundation/photos/use-photo-uploads';
import type { ItemFormOpening } from './form-opening';
import type { FormSaveActions } from './use-form-save-actions';
import type { FormSources } from './use-form-sources';

const mocks = vi.hoisted(() => ({
  useCodeAssist: vi.fn(),
  useFormSaveActions: vi.fn(),
  usePhotoUploads: vi.fn(),
  useShortcutScope: vi.fn(),
  useOnline: vi.fn(),
}));

vi.mock('./use-code-assist', () => ({ useCodeAssist: mocks.useCodeAssist }));
vi.mock('./use-form-save-actions', () => ({ useFormSaveActions: mocks.useFormSaveActions }));
vi.mock('../../foundation/photos/use-photo-uploads', () => ({
  usePhotoUploads: mocks.usePhotoUploads,
}));
vi.mock('./use-online', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../foundation/shortcuts/shortcut-provider', () => ({
  useShortcutScope: mocks.useShortcutScope,
}));

function sources(): FormSources {
  return {
    catalogue: undefined,
    types: [],
    world: buildWorld([], []),
    recents: [],
    createLocation: vi.fn(async () => undefined),
    typeLabel: () => null,
    revision: null,
    item: null,
    status: 'success',
    error: null,
    retry: vi.fn(),
  };
}

function opening(): ItemFormOpening {
  const draft = { ...blankDraft(), mode: 'edit' as const, name: 'Desk lamp' };
  return {
    draft,
    initial: draft,
    editing: { id: 'item-1', name: 'Desk lamp' },
    revision: 1,
    computed: {},
  };
}

function photos(): PhotoUploads {
  return {
    queue: [
      {
        localId: 'broken',
        fileName: 'broken.jpg',
        bytes: 1024,
        status: { kind: 'failed', reason: 'upload failed' },
      },
    ],
    refused: [],
    add: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
    flush: vi.fn(async () => ({ attached: 0, queue: [] })),
    reset: vi.fn(),
    stagedCount: 0,
    attachedCount: 0,
  };
}

function saveActions(): FormSaveActions {
  return {
    saving: false,
    saveError: null,
    justCreated: null,
    save: vi.fn(),
    saveAndNew: vi.fn(),
  };
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
  return <MemoryRouter initialEntries={['/inventory/items/item-1/edit']}>{children}</MemoryRouter>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCodeAssist.mockReturnValue({ suggest: vi.fn(), type: vi.fn() });
  mocks.useFormSaveActions.mockReturnValue(saveActions());
  mocks.usePhotoUploads.mockReturnValue(photos());
  mocks.useOnline.mockReturnValue(true);
});

describe('useItemForm', () => {
  it('asks for confirmation when an edit has a failed photo upload', () => {
    const { result } = renderHook(() => useItemForm(opening(), sources()), { wrapper });

    act(() => result.current.requestCancel());

    expect(result.current.cancelAsked).toBe(true);
  });
});

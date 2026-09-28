import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { blankDraft } from './form-draft';
import { IdentityFields } from './identity-fields';

import type { FormTypeDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';

function typeDef(
  id: string,
  label: string,
  parentTypeId: string | null,
  containment = false
): FormTypeDef {
  return {
    id,
    key: id,
    label,
    description: null,
    parentTypeId,
    containment,
    fields: [],
  };
}

const bedding = typeDef('type-bedding', 'Bedding', null);
const sheet = typeDef('type-sheet', 'Sheet', 'type-bedding');
const quiltCover = typeDef('type-quilt-cover', 'Quilt cover', 'type-bedding');
const movingBox = typeDef('type-box', 'Moving box', null, true);
const types: readonly FormTypeDef[] = [bedding, sheet, quiltCover, movingBox];
const legacyType: FormTypeDef = {
  id: 'type-legacy',
  key: 'legacy',
  label: 'Legacy type',
  description: null,
  containment: false,
  fields: [],
};

function renderFields(
  draft: ItemDraft = blankDraft(),
  type: FormTypeDef | null = null,
  allowNoType = true,
  pickerTypes: readonly FormTypeDef[] = types
): ReturnType<typeof vi.fn<(action: DraftAction) => void>> {
  const dispatch = vi.fn<(action: DraftAction) => void>();
  render(
    <IdentityFields
      draft={draft}
      type={type}
      types={pickerTypes}
      allowNoType={allowNoType}
      nameError={null}
      dispatch={dispatch}
    />
  );
  return dispatch;
}

describe('IdentityFields type picker', () => {
  it('opens with hierarchical paths and lets a parent type be selected', async () => {
    const user = userEvent.setup();
    const dispatch = renderFields();

    await user.click(screen.getByRole('combobox', { name: 'Type' }));

    expect(screen.getAllByText('No type yet')).toHaveLength(2);
    expect(screen.getByText('Bedding')).toBeInTheDocument();
    expect(screen.queryByText('Bedding › Sheet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand' }));

    const child = screen.getByText('Bedding › Sheet');
    expect(child.closest('[role="treeitem"]')).toHaveAttribute('aria-level', '2');

    await user.click(screen.getByText('Bedding'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'type',
      typeId: 'type-bedding',
      containment: false,
    });
  });

  it('selects a visible descendant', async () => {
    const user = userEvent.setup();
    const dispatch = renderFields();

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByRole('button', { name: 'Expand' }));
    await user.click(screen.getByText('Bedding › Sheet'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'type',
      typeId: 'type-sheet',
      containment: false,
    });
  });

  it('keeps the selected descendant path in the trigger label', () => {
    renderFields(blankDraft(undefined, 'type-sheet'), sheet);

    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Bedding › Sheet');
  });

  it('keeps matching ancestors visible when searching for a child path', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.type(screen.getByPlaceholderText('Search types'), 'sheet');

    expect(screen.getByText('Bedding')).toBeInTheDocument();
    expect(screen.getByText('Bedding › Sheet')).toBeInTheDocument();
    expect(screen.queryByText('Moving box')).not.toBeInTheDocument();
  });

  it('changes an existing type and carries containment from the selected type', async () => {
    const user = userEvent.setup();
    const draft = blankDraft(undefined, 'type-sheet');
    const dispatch = renderFields(draft, sheet, false);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByText('Moving box'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'type',
      typeId: 'type-box',
      containment: true,
    });
  });

  it('does not offer clearing once an existing item already has a type', async () => {
    const user = userEvent.setup();
    renderFields(blankDraft(undefined, 'type-sheet'), sheet, false);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));

    expect(screen.queryByText('No type yet')).not.toBeInTheDocument();
  });

  it('keeps flat form types selectable when parent metadata is absent', async () => {
    const user = userEvent.setup();
    const dispatch = renderFields(blankDraft(), null, true, [legacyType]);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByText('Legacy type'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'type',
      typeId: 'type-legacy',
      containment: false,
    });
  });
});

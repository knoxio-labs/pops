import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { blankDraft } from './form-draft';
import { IdentityFields } from './identity-fields';

import type { FormTypeDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';

interface TreeFormTypeDef extends FormTypeDef {
  readonly parentTypeId: string | null;
}

function typeDef(
  id: string,
  label: string,
  parentTypeId: string | null,
  containment = false
): TreeFormTypeDef {
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

    expect(screen.getByRole('option', { name: 'No type yet' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Bedding$/u })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Bedding › Sheet$/u })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /^Bedding$/u }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'type',
      typeId: 'type-bedding',
      containment: false,
    });
  });

  it('keeps matching ancestors visible when searching for a child path', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.type(screen.getByPlaceholderText('Search types'), 'sheet');

    expect(screen.getByRole('option', { name: /^Bedding$/u })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Bedding › Sheet$/u })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Moving box$/u })).not.toBeInTheDocument();
  });

  it('changes an existing type and carries containment from the selected type', async () => {
    const user = userEvent.setup();
    const draft = blankDraft(undefined, 'type-sheet');
    const dispatch = renderFields(draft, sheet, false);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByRole('option', { name: /^Moving box$/u }));

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

    expect(screen.queryByRole('option', { name: 'No type yet' })).not.toBeInTheDocument();
  });

  it('keeps flat form types selectable when parent metadata is absent', async () => {
    const user = userEvent.setup();
    const dispatch = renderFields(blankDraft(), null, true, [legacyType]);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByRole('option', { name: /^Legacy type$/u }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'type',
      typeId: 'type-legacy',
      containment: false,
    });
  });
});

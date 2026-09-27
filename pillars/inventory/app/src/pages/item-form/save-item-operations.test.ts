import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { blankDraft, draftReducer } from './form-draft';
import { createItem, saveItemEdits } from './save-item-operations';

import type { InventoryCommand } from '../../inventory-web/commands.js';
import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';
import type { SendCommand } from './save-item-operations';
import type { SaveResult } from './save-types';

const cable: FormTypeDef = {
  id: 'cable',
  key: 'cable',
  label: 'Cable',
  description: null,
  containment: false,
  fields: [
    {
      id: 'colour-id',
      key: 'colour',
      label: 'Colour',
      kind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      allowOverride: false,
      help: null,
      fixedUnit: null,
      enumOptions: [],
      referenceKinds: [],
      referenceTypeIds: [],
      expression: null,
    },
  ],
};

const computedCable: FormTypeDef = {
  ...cable,
  fields: [
    ...cable.fields,
    {
      id: 'replacement-value',
      key: 'replacement_value',
      label: 'Replacement value',
      kind: 'decimal',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      allowOverride: true,
      help: null,
      fixedUnit: null,
      enumOptions: [],
      referenceKinds: [],
      referenceTypeIds: [],
      expression: {},
    },
  ],
};

function savedResult(itemId = 'item-1', revision = 1): SaveResult {
  return { status: 'saved', result: { itemId, revision } };
}

function editDraft(draft: ItemDraft): ItemDraft {
  return { ...draft, mode: 'edit' };
}

describe('item form save operations', () => {
  it('sends create values using stable field ids and the catalogue revision', async () => {
    const commands: InventoryCommand[] = [];
    const send: SendCommand = async (command, _entityId, options) => {
      commands.push(command);
      expect(options?.catalogueRevision).toBe(12);
      return savedResult();
    };
    const draft = draftReducer(blankDraft(), {
      type: 'field-text',
      fieldId: 'colour-id',
      values: ['red'],
    });

    await createItem({
      draft,
      type: cable,
      catalogueRevision: 12,
      queryClient: new QueryClient(),
      send,
    });

    const command = commands[0];
    expect(command?.op).toBe('item.create');
    if (command?.op !== 'item.create') throw new Error('expected item.create');
    expect(command.args.item).toMatchObject({
      typeId: 'cable',
      values: [{ fieldId: 'colour-id', source: 'stored', values: ['red'] }],
    });
  });

  it('sends null for a cleared field in an edit patch', async () => {
    const commands: InventoryCommand[] = [];
    const send: SendCommand = async (command) => {
      commands.push(command);
      return savedResult();
    };
    const initial = editDraft(
      draftReducer(blankDraft(), { type: 'field-text', fieldId: 'colour-id', values: ['red'] })
    );
    const draft = draftReducer(initial, {
      type: 'field-text',
      fieldId: 'colour-id',
      values: [''],
    });

    await saveItemEdits({
      id: 'item-1',
      draft,
      initial,
      type: cable,
      catalogueRevision: 12,
      baseRevision: 7,
      queryClient: new QueryClient(),
      send,
    });

    const command = commands[0];
    expect(command?.op).toBe('item.edit');
    if (command?.op !== 'item.edit') throw new Error('expected item.edit');
    expect(command.args.values).toEqual([{ fieldId: 'colour-id', values: null }]);
  });

  it('uses the opening revision and advances it between edit commands', async () => {
    const commands: InventoryCommand[] = [];
    const revisions: number[] = [];
    let nextRevision = 8;
    const send: SendCommand = async (command, _entityId, options) => {
      commands.push(command);
      if (options?.baseRevision !== undefined) revisions.push(options.baseRevision);
      return savedResult('item-1', nextRevision++);
    };
    const initial = editDraft({ ...blankDraft(), name: 'Cable' });
    const draft: ItemDraft = {
      ...initial,
      name: 'Long cable',
      placement: { kind: 'location', locationId: 'garage' },
    };

    await saveItemEdits({
      id: 'item-1',
      draft,
      initial,
      type: cable,
      catalogueRevision: 12,
      baseRevision: 7,
      queryClient: new QueryClient(),
      send,
    });

    expect(commands.map((command) => command.op)).toEqual(['item.edit', 'item.move']);
    expect(revisions).toEqual([7, 8]);
  });

  it('returns the applied draft and revision when a later command is refused', async () => {
    const commands: InventoryCommand[] = [];
    const send: SendCommand = async (command, _entityId, options) => {
      commands.push(command);
      if (command.op === 'item.edit') return savedResult('item-1', 8);
      expect(options?.baseRevision).toBe(8);
      return {
        status: 'refused',
        refusal: { kind: 'message', message: 'The destination changed elsewhere.' },
      };
    };
    const initial = editDraft({ ...blankDraft(), name: 'Cable' });
    const draft: ItemDraft = {
      ...initial,
      name: 'Long cable',
      placement: { kind: 'location', locationId: 'garage' },
    };

    const result = await saveItemEdits({
      id: 'item-1',
      draft,
      initial,
      type: cable,
      catalogueRevision: 12,
      baseRevision: 7,
      queryClient: new QueryClient(),
      send,
    });

    expect(commands.map((command) => command.op)).toEqual(['item.edit', 'item.move']);
    expect(result).toMatchObject({
      status: 'refused',
      revision: 8,
      initial: { name: 'Long cable' },
    });
  });

  it('replaces a changed type with only the new type fields', async () => {
    const commands: InventoryCommand[] = [];
    const send: SendCommand = async (command) => {
      commands.push(command);
      return savedResult();
    };
    const initial = editDraft({ ...blankDraft(), typeId: 'old-type' });
    const draft = draftReducer(
      draftReducer(
        { ...initial, typeId: 'cable' },
        {
          type: 'field-text',
          fieldId: 'colour-id',
          values: ['red'],
        }
      ),
      { type: 'field-text', fieldId: 'old-field-id', values: ['stale'] }
    );

    await saveItemEdits({
      id: 'item-1',
      draft,
      initial,
      type: cable,
      catalogueRevision: 12,
      baseRevision: 7,
      queryClient: new QueryClient(),
      send,
    });

    const command = commands[0];
    expect(command?.op).toBe('item.changeType');
    if (command?.op !== 'item.changeType') throw new Error('expected item.changeType');
    expect(command.args).toEqual({
      typeId: 'cable',
      values: [{ fieldId: 'colour-id', values: ['red'] }],
    });
  });

  it('saves computed overrides through the typed override command', async () => {
    const commands: InventoryCommand[] = [];
    const send: SendCommand = async (command, _entityId, options) => {
      commands.push(command);
      expect(options?.catalogueRevision).toBe(12);
      return savedResult();
    };
    const initial = editDraft({ ...blankDraft(), typeId: 'cable' });
    const draft = { ...initial, typeId: 'cable', overrides: { 'replacement-value': '19.99' } };

    await saveItemEdits({
      id: 'item-1',
      draft,
      initial,
      type: computedCable,
      catalogueRevision: 12,
      baseRevision: 7,
      queryClient: new QueryClient(),
      send,
    });

    expect(commands).toEqual([
      {
        op: 'item.setOverride',
        args: { fieldId: 'replacement-value', values: ['19.99'] },
      },
    ]);
  });
});

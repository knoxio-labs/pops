import { describe, expect, it } from 'vitest';

import { blankDraft, draftAfterSaveAndNew, draftReducer } from './form-draft';

describe('item form draft', () => {
  it('starts a create draft in hand with no type and quantity one', () => {
    expect(blankDraft()).toMatchObject({
      mode: 'create',
      typeId: null,
      quantity: '1',
      placement: { kind: 'in-hand' },
    });
  });

  it('forces container quantity to one while preserving other draft work', () => {
    const draft = draftReducer(
      { ...blankDraft(), name: 'Shelf', quantity: '4' },
      { type: 'type', typeId: 'container', containment: true }
    );
    expect(draft).toMatchObject({ name: 'Shelf', typeId: 'container', quantity: '1' });
  });

  it('keeps type and placement but clears identity for save and start another', () => {
    const draft = draftReducer(blankDraft({ kind: 'location', locationId: 'garage' }), {
      type: 'name',
      value: 'Cable',
    });
    const next = draftAfterSaveAndNew({ ...draft, typeId: 'cable', quantity: '3' });
    expect(next).toMatchObject({
      name: '',
      typeId: 'cable',
      quantity: '1',
      placement: { kind: 'location', locationId: 'garage' },
    });
    expect(next.code.value).toBe('');
  });
});

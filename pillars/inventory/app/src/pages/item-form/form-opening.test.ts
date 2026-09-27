import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { createOpening, fieldDraftsFromProtocolFields } from './form-opening';

import type { FormTypeDef } from './field-model';

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
    {
      id: 'active-id',
      key: 'active',
      label: 'Active',
      kind: 'boolean',
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

describe('item form opening', () => {
  it('opens a create draft at the location supplied by the in query', () => {
    const opening = createOpening(
      new URLSearchParams('in=garage'),
      buildWorld([], [{ id: 'garage', name: 'Garage', parentId: null, kind: 'property' }]),
      undefined
    );

    expect(opening).toMatchObject({
      editing: null,
      revision: null,
      draft: { placement: { kind: 'location', locationId: 'garage' } },
    });
  });

  it('loads protocol field keys into stable form field ids', () => {
    expect(fieldDraftsFromProtocolFields({ colour: 'red', active: true }, cable)).toEqual({
      text: { 'colour-id': ['red'] },
      refs: {},
      booleans: { 'active-id': true },
    });
  });
});

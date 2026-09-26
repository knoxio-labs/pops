import { itemTypeFields, itemTypes } from '../../../db/index.js';
import {
  FIELD_IDS,
  INHERITED_REQUIRED_CHILD_TYPE_ID,
  INHERITED_REQUIRED_PARENT_TYPE_ID,
} from './catalogue-fields.js';

import type { CommandDb } from '../../../domain/commands/entities.js';

const TYPE_ROWS = [
  [
    INHERITED_REQUIRED_PARENT_TYPE_ID,
    'value_vector_required_parent',
    'Value Vector Required Parent',
    7,
    null,
  ],
  [
    INHERITED_REQUIRED_CHILD_TYPE_ID,
    'value_vector_required_child',
    'Value Vector Required Child',
    8,
    INHERITED_REQUIRED_PARENT_TYPE_ID,
  ],
] as const;

/** Inserts the parent and child types used to exercise inherited required fields. */
export function insertInheritedRequiredTypes(db: CommandDb, revision: number): void {
  for (const [id, key, label, sortOrder, parentTypeId] of TYPE_ROWS) {
    db.insert(itemTypes)
      .values({
        revision,
        id,
        key,
        label,
        description: null,
        sortOrder,
        parentTypeId,
        capabilitiesJson: '[]',
        legacyLabelsJson: '[]',
        presentationJson: '{}',
        archivedAt: null,
      })
      .run();
  }
}

/** Inserts the required short-text field owned by the inherited-field parent type. */
export function insertInheritedRequiredField(db: CommandDb, revision: number): void {
  db.insert(itemTypeFields)
    .values({
      revision,
      id: FIELD_IDS.inheritedRequired,
      typeId: INHERITED_REQUIRED_PARENT_TYPE_ID,
      key: 'inheritedRequired',
      label: 'Inherited required',
      help: null,
      sortOrder: 0,
      kind: 'short_text',
      cardinality: 'one',
      required: 1,
      storage: 'stored',
      fixedUnit: null,
      referenceKindsJson: '[]',
      referenceTypeIdsJson: '[]',
      expressionVersion: null,
      expressionJson: null,
      allowOverride: 0,
      presentationJson: '{}',
      archivedAt: null,
    })
    .run();
}

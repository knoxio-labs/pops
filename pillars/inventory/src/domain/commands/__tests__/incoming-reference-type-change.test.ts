/**
 * POPS-4617: a type change refused because it would break an OTHER item's
 * incoming reference must name that item and field, distinct from the
 * command's own values — a value the command carries can be entirely valid
 * while the refusal is about something else's reference into it.
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { activatePersistedCatalogueProtocol } from '../../../catalogue/__tests__/protocol-rollout-fixture.js';
import { publishItemTypeTree } from '../../../catalogue/__tests__/type-tree-fixture.js';
import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../../catalogue/authoring.js';
import { mutation, openHarness } from './test-utils.js';

import type { Harness } from './test-utils.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

interface ThreeTypeCatalogue {
  readonly revision: number;
  readonly holderTypeId: string;
  readonly peerFieldId: string;
  readonly retypedTypeId: string;
  readonly widgetTypeId: string;
  readonly linkedFieldId: string;
  readonly cableTypeId: string;
}

/**
 * `holder_device.peer` may only name a live `retyped_device`; `widget_device`
 * has its own, unrelated reference field so a command retyping into it never
 * shares a field id with `peer`.
 */
function publishThreeTypes(harness: Harness): ThreeTypeCatalogue {
  activatePersistedCatalogueProtocol(harness.db);
  const created = createCatalogueDraft(harness.db, 1, AUTHOR);
  const revision = created.revision.revision;
  const withTypes = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision: 1, expectedDraftVersion: created.revision.draftVersion },
    [
      { kind: 'put_type', key: 'holder_device', label: 'Holder device', capabilities: [] },
      { kind: 'put_type', key: 'retyped_device', label: 'Retyped device', capabilities: [] },
      { kind: 'put_type', key: 'widget_device', label: 'Widget device', capabilities: [] },
    ]
  );
  const holderType = withTypes.draft.types.find((entry) => entry.key === 'holder_device');
  const retypedType = withTypes.draft.types.find((entry) => entry.key === 'retyped_device');
  const widgetType = withTypes.draft.types.find((entry) => entry.key === 'widget_device');
  const cable = withTypes.draft.types.find((entry) => entry.key === 'cable');
  if (!holderType || !retypedType || !widgetType || !cable) {
    throw new Error('types were not created');
  }

  const withFields = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision: 1, expectedDraftVersion: withTypes.draft.revision.draftVersion },
    [
      {
        kind: 'put_field',
        typeId: holderType.id,
        key: 'peer',
        label: 'Peer',
        fieldKind: 'reference',
        cardinality: 'one',
        required: false,
        storage: 'stored',
        referenceKinds: ['item'],
        referenceTypeIds: [retypedType.id],
      },
      {
        kind: 'put_field',
        typeId: widgetType.id,
        key: 'linked',
        label: 'Linked',
        fieldKind: 'reference',
        cardinality: 'one',
        required: false,
        storage: 'stored',
        referenceKinds: ['item'],
        referenceTypeIds: [cable.id],
      },
    ]
  );
  const peerField = withFields.draft.types
    .find((entry) => entry.id === holderType.id)
    ?.fields.find((entry) => entry.key === 'peer');
  const linkedField = withFields.draft.types
    .find((entry) => entry.id === widgetType.id)
    ?.fields.find((entry) => entry.key === 'linked');
  if (!peerField || !linkedField) throw new Error('fields were not created');

  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision: 1, expectedDraftVersion: withFields.draft.revision.draftVersion, note: null },
    AUTHOR
  );

  return {
    revision,
    holderTypeId: holderType.id,
    peerFieldId: peerField.id,
    retypedTypeId: retypedType.id,
    widgetTypeId: widgetType.id,
    linkedFieldId: linkedField.id,
    cableTypeId: cable.id,
  };
}

describe('a type change refused for another item’s incoming reference', () => {
  it('names the other item and field, distinct from the command’s own reference value', () => {
    const harness = openHarness();
    const catalogue = publishThreeTypes(harness);

    const cableId = randomUUID();
    harness.run(
      mutation(
        'item.create',
        cableId,
        { item: { name: 'Cable', typeId: catalogue.cableTypeId, values: [] } },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      )
    );

    const retypedId = randomUUID();
    harness.run(
      mutation(
        'item.create',
        retypedId,
        { item: { name: 'Sensor', typeId: catalogue.retypedTypeId, values: [] } },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      )
    );

    const holderId = randomUUID();
    harness.run(
      mutation(
        'item.create',
        holderId,
        {
          item: {
            name: 'Holder',
            typeId: catalogue.holderTypeId,
            values: [
              {
                fieldId: catalogue.peerFieldId,
                values: [{ targetKind: 'item', targetId: retypedId }],
              },
            ],
          },
        },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      )
    );

    const outcome = harness.run(
      mutation(
        'item.changeType',
        retypedId,
        {
          typeId: catalogue.widgetTypeId,
          values: [
            {
              fieldId: catalogue.linkedFieldId,
              values: [{ targetKind: 'item', targetId: cableId }],
            },
          ],
        },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: 'reference_type_mismatch',
      incomingReference: { itemId: holderId, fieldId: catalogue.peerFieldId },
    });
    if (outcome.status === 'rejected') {
      expect(outcome.incomingReference?.fieldId).not.toBe(catalogue.linkedFieldId);
      expect(outcome.incomingReference?.itemId).not.toBe(retypedId);
    }
    expect(harness.item(retypedId).revision).toBe(1);
  });

  it('accepts a sheet descendant for an incoming reference constrained to bedding', () => {
    const harness = openHarness();
    const catalogue = publishItemTypeTree(harness.db);
    const targetId = randomUUID();
    const holderId = randomUUID();
    const material = () => ({
      fieldId: catalogue.materialFieldId,
      values: [{ optionId: catalogue.materialCottonOptionId }],
    });

    expect(
      harness.run(
        mutation(
          'item.create',
          targetId,
          {
            item: {
              name: 'Target bedding',
              typeId: catalogue.beddingTypeId,
              values: [material()],
            },
          },
          { baseRevision: null, catalogueRevision: catalogue.revision }
        )
      )
    ).toMatchObject({ status: 'applied' });
    expect(
      harness.run(
        mutation(
          'item.create',
          holderId,
          {
            item: {
              name: 'Holder bedding',
              typeId: catalogue.beddingTypeId,
              values: [
                material(),
                {
                  fieldId: catalogue.partnerFieldId,
                  values: [{ targetKind: 'item', targetId }],
                },
              ],
            },
          },
          { baseRevision: null, catalogueRevision: catalogue.revision }
        )
      )
    ).toMatchObject({ status: 'applied' });

    const changed = harness.run(
      mutation(
        'item.changeType',
        targetId,
        { typeId: catalogue.sheetTypeId, values: [material()] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );

    expect(changed).toMatchObject({ status: 'applied' });
  });
});

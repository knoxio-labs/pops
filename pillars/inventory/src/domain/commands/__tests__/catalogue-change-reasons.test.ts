import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../../catalogue/authoring.js';
import { activateMinimumProtocol } from '../../../protocol/rollout.js';
import { mutation, openHarness } from './test-utils.js';

import type { CataloguePublicationInput } from '../../../catalogue/authoring-types.js';
import type { Harness } from './test-utils.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

type Operations = Parameters<typeof patchCatalogueDraft>[2];
type Draft = ReturnType<typeof patchCatalogueDraft>['draft'];

function publish(
  harness: Harness,
  baseRevision: number,
  operations: Operations,
  extra: (draft: Draft) => Partial<CataloguePublicationInput> = () => ({})
): { readonly revision: number; readonly draft: Draft } {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  const { draft } = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision, expectedDraftVersion: created.revision.draftVersion },
    operations
  );
  publishCatalogueDraft(
    harness.db,
    revision,
    {
      baseRevision,
      expectedDraftVersion: draft.revision.draftVersion,
      note: null,
      ...extra(draft),
    },
    AUTHOR
  );
  return { revision, draft };
}

interface Probe {
  readonly revision: number;
  readonly typeId: string;
  readonly serialId: string;
  readonly tagsId: string;
  readonly keptOptionId: string;
  readonly retiredOptionId: string;
}

function publishProbe(harness: Harness): Probe {
  const typed = publish(harness, 1, [{ kind: 'put_type', key: 'probe', label: 'Probe' }]);
  const typeId = typed.draft.types.find((type) => type.key === 'probe')?.id ?? '';
  const stored = { cardinality: 'one', required: false, storage: 'stored' } as const;
  const fielded = publish(harness, typed.revision, [
    {
      kind: 'put_field',
      typeId,
      key: 'serial',
      label: 'Serial',
      fieldKind: 'short_text',
      ...stored,
    },
    {
      kind: 'put_field',
      typeId,
      key: 'tags',
      label: 'Tags',
      fieldKind: 'enum',
      ...stored,
      cardinality: 'many',
    },
  ]);
  const fields = fielded.draft.types.find((type) => type.id === typeId)?.fields ?? [];
  const serialId = fields.find((field) => field.key === 'serial')?.id ?? '';
  const tagsId = fields.find((field) => field.key === 'tags')?.id ?? '';
  const optioned = publish(harness, fielded.revision, [
    { kind: 'put_enum_option', fieldId: tagsId, key: 'kept', label: 'Kept' },
    { kind: 'put_enum_option', fieldId: tagsId, key: 'retired', label: 'Retired' },
  ]);
  const options =
    optioned.draft.types.find((type) => type.id === typeId)?.fields.find((f) => f.id === tagsId)
      ?.enumOptions ?? [];
  return {
    revision: optioned.revision,
    typeId,
    serialId,
    tagsId,
    keptOptionId: options.find((option) => option.key === 'kept')?.id ?? '',
    retiredOptionId: options.find((option) => option.key === 'retired')?.id ?? '',
  };
}

function relabel(harness: Harness, probe: Probe, baseRevision: number, label: string): number {
  return publish(harness, baseRevision, [{ kind: 'put_type', id: probe.typeId, label }]).revision;
}

function createProbe(probe: Probe, values: { fieldId: string; values: unknown[] }[]) {
  return mutation(
    'item.create',
    randomUUID(),
    { item: { name: 'Probe', typeId: probe.typeId, values } },
    { baseRevision: null, catalogueRevision: probe.revision }
  );
}

describe('structured catalogue reasons', () => {
  it('names a revision the server does not hold', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);

    const outcome = harness.run({ ...createProbe(probe, []), catalogueRevision: 999 });

    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: 'catalogue_update_required',
      catalogueChanges: [
        {
          definition: 'revision',
          id: '999',
          typeId: null,
          fieldId: null,
          change: 'not_in_revision',
          replacementId: null,
          revision: 999,
        },
      ],
    });
  });

  it('dates an archived field by the revision that archived it, not the active one', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = createProbe(probe, [{ fieldId: probe.serialId, values: ['SN-1'] }]);
    const archived = publish(harness, probe.revision, [
      { kind: 'archive_field', id: probe.serialId },
    ]).revision;
    const active = relabel(harness, probe, archived, 'Renamed probe');

    const first = harness.run(queued);
    const replayed = harness.run(queued);

    expect(active).toBeGreaterThan(archived);
    expect(first).toMatchObject({
      status: 'rejected',
      reason: 'catalogue_repair_required',
      catalogueChanges: [
        {
          definition: 'field',
          id: probe.serialId,
          typeId: probe.typeId,
          fieldId: probe.serialId,
          change: 'archived',
          replacementId: null,
          revision: archived,
        },
      ],
    });
    expect(replayed).toEqual(first);
  });

  it('names an archived type', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = createProbe(probe, []);
    const archived = publish(harness, probe.revision, [
      { kind: 'archive_type', id: probe.typeId },
    ]).revision;

    expect(harness.run(queued)).toMatchObject({
      reason: 'catalogue_repair_required',
      catalogueChanges: [
        { definition: 'type', id: probe.typeId, typeId: probe.typeId, fieldId: null },
      ],
    });
    expect(harness.run(queued)).toMatchObject({
      catalogueChanges: [{ change: 'archived', revision: archived }],
    });
  });

  it('names the retired option, not just its field', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = createProbe(probe, [
      {
        fieldId: probe.tagsId,
        values: [{ optionId: probe.keptOptionId }, { optionId: probe.retiredOptionId }],
      },
    ]);
    const retired = publish(harness, probe.revision, [
      { kind: 'archive_enum_option', id: probe.retiredOptionId },
    ]).revision;

    expect(harness.run(queued)).toMatchObject({
      reason: 'catalogue_repair_required',
      catalogueChanges: [
        {
          definition: 'option',
          id: probe.retiredOptionId,
          typeId: probe.typeId,
          fieldId: probe.tagsId,
          change: 'retired',
          revision: retired,
        },
      ],
    });
  });

  it('names a field the newer revision made required, dated by that revision', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = createProbe(probe, []);
    const relabelled = relabel(harness, probe, probe.revision, 'Relabelled probe');
    const required = publish(
      harness,
      relabelled,
      [{ kind: 'put_field', id: probe.serialId, typeId: probe.typeId, required: true }],
      (draft) => ({
        migration: {
          name: 'require-serial',
          fromRevision: relabelled,
          toRevision: draft.revision.revision,
          affectedTypeIds: [probe.typeId],
          affectedFieldIds: [probe.serialId],
          steps: [{ kind: 'set_default', fieldId: probe.serialId, values: ['unknown'] }],
        },
      })
    ).revision;

    expect(harness.run(queued)).toMatchObject({
      status: 'rejected',
      reason: 'catalogue_update_required',
      catalogueChanges: [
        {
          definition: 'field',
          id: probe.serialId,
          typeId: probe.typeId,
          fieldId: probe.serialId,
          change: 'now_required',
          revision: required,
        },
      ],
    });
  });

  it('says a protocol-gated revision needs a newer app, dated by the gating revision', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = createProbe(probe, []);
    activateMinimumProtocol(harness.db, 1, 2);
    const gated = publish(harness, probe.revision, [], () => ({ minimumProtocol: 2 })).revision;
    relabel(harness, probe, gated, 'After the gate');

    expect(harness.run(queued)).toMatchObject({
      reason: 'catalogue_update_required',
      catalogueChanges: [
        { definition: 'revision', id: String(gated), change: 'needs_newer_app', revision: gated },
      ],
    });
  });

  it('carries no catalogue changes on an ordinary refusal', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);

    const outcome = harness.run(createProbe(probe, [{ fieldId: probe.serialId, values: [42] }]));

    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(outcome).not.toHaveProperty('catalogueChanges');
  });
});

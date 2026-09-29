import { describe, expect, it } from 'vitest';

import { LEDGER_REPAIR_KINDS } from '@pops/inventory';

import {
  archivedCase,
  codeCase,
  deletedCase,
  fieldCase,
  fieldsNotHereCase,
  nowRequiredCase,
  optionRetiredCase,
  photoCase,
  placementCase,
  referenceGoneCase,
  referenceNotAllowedCase,
  typeReplacedCase,
  updatingCase,
} from '../../../foundation/test-fixtures/sync.js';
import { planFor } from './repair-plan.js';

import type { RepairCase } from '../sync-model.js';

const cases: readonly RepairCase[] = [
  placementCase,
  fieldCase,
  codeCase,
  deletedCase,
  photoCase,
  updatingCase,
  archivedCase,
  typeReplacedCase,
  optionRetiredCase,
  nowRequiredCase,
  fieldsNotHereCase,
  referenceGoneCase,
  referenceNotAllowedCase,
];

describe('planFor', () => {
  it('stages one fixture per repair kind', () => {
    const kinds = new Set(cases.map((repair) => repair.kind));

    expect(kinds).toEqual(new Set(LEDGER_REPAIR_KINDS));
  });

  it('has a planner for every contract repair kind', () => {
    for (const kind of LEDGER_REPAIR_KINDS) {
      const repair = cases.find((candidate) => candidate.kind === kind);
      if (repair === undefined) throw new Error(`missing fixture for ${kind}`);
      expect(planFor(repair, "Joao's iPhone")).toBeDefined();
    }
  });

  it.each(cases)('leaves a named choice on the device for $kind', (repair) => {
    expect(planFor(repair, "Joao's iPhone").onDevice).toMatch(/iPhone|nothing to do/i);
  });

  it('moves to the device value for a placement conflict', () => {
    const plan = planFor(
      {
        ...placementCase,
        mine: { value: 'Office 04', source: 'iPhone', at: placementCase.openedAt },
        theirs: { value: 'Desk', source: 'web', at: placementCase.openedAt },
      },
      "Joao's iPhone"
    );

    expect(plan.primary).toMatchObject({ id: 'use-mine', label: 'Move to Office 04' });
    expect(plan.onDevice).toContain('Discard mine');
  });

  it('uses the device value for a field conflict', () => {
    const plan = planFor(
      {
        ...fieldCase,
        mine: { value: 'Television', source: 'iPhone', at: fieldCase.openedAt },
        theirs: { value: 'TV', source: 'web', at: fieldCase.openedAt },
      },
      "Joao's iPhone"
    );

    expect(plan.primary).toMatchObject({ id: 'use-mine', label: 'Use Television' });
    expect(plan.onDevice).toContain('TV');
  });

  it('labels with the suggested code for a collision', () => {
    const plan = planFor(codeCase, "Joao's iPhone");

    expect(plan.primary).toMatchObject({ id: 'use-suggested', label: 'Use code T03' });
    expect(plan.secondary[0]).toMatchObject({ id: 'open-holder', label: 'Open Cable tub' });
  });

  it('offers to save only what still fits', () => {
    const plan = planFor(archivedCase, "Joao's iPhone");

    expect(plan.primary).toMatchObject({ id: 'save-fitting', label: 'Save Length 2 m here' });
  });

  it('offers no primary action when nothing exists on the server to change', () => {
    expect(planFor(updatingCase, "Joao's iPhone").primary).toBeNull();
    expect(planFor(fieldsNotHereCase, "Joao's iPhone").primary).toBeNull();
  });

  it('offers no save when no held value fits', () => {
    const plan = planFor({ ...archivedCase, held: undefined }, "Joao's iPhone");

    expect(plan.primary).toBeNull();
  });

  it('restores the deleted record a reference points at', () => {
    const plan = planFor(
      {
        ...referenceGoneCase,
        held: {
          title: 'Held edit',
          values: [{ field: 'Power', value: 'Desk', fit: 'record-gone' }],
        },
      },
      "Joao's iPhone"
    );

    expect(plan.primary).toMatchObject({ id: 'restore-reference', label: 'Restore Desk' });
    expect(plan.secondary[0]).toMatchObject({ id: 'save-fitting' });
  });

  it('offers Open item only and no device line for an unknown kind', () => {
    const repair: RepairCase = { ...photoCase, kind: 'future-repair-kind' };

    expect(planFor(repair, "Joao's iPhone")).toEqual({
      primary: null,
      secondary: [{ id: 'open-item', label: 'Open Cordless drill' }],
      onDevice: null,
    });
  });
});

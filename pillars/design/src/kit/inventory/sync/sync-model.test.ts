import * as records from '@/fixtures/inventory/sync-cases';
import * as catalogue from '@/fixtures/inventory/sync-catalogue-cases';
import { busyLedger, clearLedger } from '@/fixtures/inventory/sync-ledger';
import { describe, expect, it } from 'vitest';

import { planFor } from './repair-plan';
import {
  casePosition,
  describeValues,
  deviceName,
  orderCases,
  segmentCounts,
  valuesThatFit,
} from './sync-model';

import type { RepairCase, RepairKind } from './sync-model';

const DEVICE = "Joao's iPhone";

const everyCase: RepairCase[] = [
  records.placementCase,
  records.fieldCase,
  records.codeCase,
  records.deletedCase,
  records.photoCase,
  catalogue.updatingCase,
  catalogue.archivedCase,
  catalogue.typeReplacedCase,
  catalogue.optionRetiredCase,
  catalogue.nowRequiredCase,
  catalogue.fieldsNotHereCase,
  catalogue.referenceGoneCase,
  catalogue.referenceNotAllowedCase,
];

describe('segmentCounts', () => {
  it('counts each list', () => {
    expect(segmentCounts(busyLedger)).toEqual({ attention: 5, waiting: 4, resolved: 6 });
    expect(segmentCounts(clearLedger)).toEqual({ attention: 0, waiting: 0, resolved: 6 });
  });
});

describe('orderCases and casePosition', () => {
  const ordered = orderCases(busyLedger.attention);

  it('works the oldest case first', () => {
    expect(ordered.map((entry) => entry.id)).toEqual([
      'case-parts-code',
      'case-drill-photo',
      'case-hdmi-shielding',
      'case-ladder-deleted',
      'case-router-placement',
    ]);
  });

  it('has no previous at the start and no next at the end', () => {
    expect(casePosition(ordered, 'case-parts-code')).toEqual({
      index: 0,
      total: 5,
      previousId: null,
      nextId: 'case-drill-photo',
    });
    expect(casePosition(ordered, 'case-router-placement')?.nextId).toBeNull();
    expect(casePosition(ordered, 'case-router-placement')?.previousId).toBe('case-ladder-deleted');
  });

  it('returns null for a case that is not in the list', () => {
    expect(casePosition(ordered, 'case-missing')).toBeNull();
    expect(casePosition([], 'case-parts-code')).toBeNull();
  });
});

describe('values', () => {
  it('keeps only values that still fit', () => {
    const values = catalogue.typeReplacedCase.held?.values ?? [];
    expect(valuesThatFit(values).map((value) => value.field)).toEqual(['Wi-Fi standard', 'Ports']);
  });

  it('describes one, two, or many values', () => {
    expect(describeValues([])).toBe('nothing');
    expect(describeValues([{ field: 'Length', value: '2 m', fit: 'fits' }])).toBe('Length 2 m');
    const three = catalogue.nowRequiredCase.held?.values ?? [];
    expect(describeValues(three)).toBe('3 values');
    expect(describeValues(three.slice(1))).toBe('Boiler Dual and Pressure 15 bar');
  });

  it('names an unknown device literally', () => {
    expect(deviceName(busyLedger.devices, 'dev-iphone')).toBe(DEVICE);
    expect(deviceName(busyLedger.devices, 'dev-gone')).toBe('An unknown device');
  });
});

describe('planFor', () => {
  it('stages one fixture per repair kind', () => {
    const kinds = new Set<RepairKind>(everyCase.map((entry) => entry.kind));
    expect(kinds.size).toBe(everyCase.length);
  });

  it.each(everyCase)('leaves a named choice on the device for $kind', (repair) => {
    const plan = planFor(repair, DEVICE);
    expect(plan.onDevice).toContain(DEVICE.split("'")[0] ?? DEVICE);
    if (plan.primary) expect(plan.primary.outcome.length).toBeGreaterThan(0);
  });

  it('moves to the device value for a placement conflict', () => {
    const plan = planFor(records.placementCase, DEVICE);
    expect(plan.primary?.label).toBe('Move to Office 04');
    expect(plan.onDevice).toBe(`To keep Filing cabinet, choose Discard mine on ${DEVICE}.`);
  });

  it('uses the device value for a field conflict', () => {
    expect(planFor(records.fieldCase, DEVICE).primary?.label).toBe('Use Living room TV');
  });

  it('labels with the suggested code for a collision', () => {
    expect(planFor(records.codeCase, DEVICE).primary?.label).toBe('Use code T03');
  });

  it('offers to save only what still fits', () => {
    expect(planFor(catalogue.archivedCase, DEVICE).primary?.label).toBe('Save Length 2 m here');
    expect(planFor(catalogue.typeReplacedCase, DEVICE).primary?.label).toBe(
      'Change type to Router'
    );
  });

  it('offers no primary action when nothing exists on the server to change', () => {
    expect(planFor(catalogue.nowRequiredCase, DEVICE).primary).toBeNull();
    expect(planFor(catalogue.fieldsNotHereCase, DEVICE).primary).toBeNull();
    expect(planFor(catalogue.updatingCase, DEVICE).primary).toBeNull();
  });

  it('offers no save when no held value fits', () => {
    const nothingFits: RepairCase = {
      ...catalogue.archivedCase,
      held: {
        title: 'Held edit',
        values: [{ field: 'Shielding', value: 'Braided', fit: 'archived' }],
      },
    };
    expect(planFor(nothingFits, DEVICE).primary).toBeNull();
  });

  it('restores the deleted record a reference points at', () => {
    expect(planFor(catalogue.referenceGoneCase, DEVICE).primary?.label).toBe('Restore Desk lamp');
  });
});

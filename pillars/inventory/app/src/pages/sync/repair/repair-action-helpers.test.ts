import { describe, expect, it } from 'vitest';

import {
  DESIGN_NOW,
  archivedCase,
  placementCase,
  referenceGoneCase,
  typeReplacedCase,
} from '../../../foundation/test-fixtures/sync.js';
import { blockedReasonFor } from './repair-action-helpers.js';

import type { RepairCase } from '../sync-model.js';
import type { WebAction } from './repair-plan.js';

const detail = { typeId: 'type-item', isPending: false, isError: false };

function action(id: WebAction['id']): WebAction {
  return { id, label: id };
}

function identifiedPlacementCase(): RepairCase {
  return {
    ...placementCase,
    mine: {
      value: 'Office 04',
      source: 'iPhone',
      at: DESIGN_NOW,
      target: { kind: 'location', locationId: 'location-office' },
    },
  };
}

function identifiedArchivedCase(): RepairCase {
  return {
    ...archivedCase,
    held: {
      title: 'Held edit',
      values: [
        {
          field: 'Length',
          value: '2 m',
          fit: 'fits',
          fieldId: 'field-length',
          values: ['2 m'],
        },
      ],
    },
  };
}

function identifiedTypeReplacementCase(): RepairCase {
  return {
    ...typeReplacedCase,
    held: {
      title: 'Held edit',
      values: [
        {
          field: 'Type',
          value: 'Network',
          fit: 'replaced',
          replacementTypeId: 'type-router',
        },
        {
          field: 'Wi-Fi standard',
          value: '802.11ax',
          fit: 'fits',
          fieldId: 'field-wifi',
          values: ['802.11ax'],
        },
      ],
    },
  };
}

function identifiedReferenceCase(): RepairCase {
  return {
    ...referenceGoneCase,
    held: {
      title: 'Held edit',
      values: [
        {
          field: 'Connected item',
          value: 'Desk lamp',
          fit: 'record-gone',
          fieldId: 'field-connected-item',
          recordId: 'item-desk-lamp',
          recordKind: 'item',
        },
      ],
    },
  };
}

describe('blockedReasonFor', () => {
  it('enables identified repair writes', () => {
    expect(
      blockedReasonFor(action('use-mine'), {
        repair: identifiedPlacementCase(),
        device: "Joao's iPhone",
        detail,
      })
    ).toBeNull();
    expect(
      blockedReasonFor(action('save-fitting'), {
        repair: identifiedArchivedCase(),
        device: "Joao's iPhone",
        detail,
      })
    ).toBeNull();
    expect(
      blockedReasonFor(action('change-type'), {
        repair: identifiedTypeReplacementCase(),
        device: "Joao's iPhone",
        detail,
      })
    ).toBeNull();
    expect(
      blockedReasonFor(action('restore-reference'), {
        repair: identifiedReferenceCase(),
        device: "Joao's iPhone",
        detail,
      })
    ).toBeNull();
  });

  it('keeps a write blocked when the report has no stable target details', () => {
    expect(
      blockedReasonFor(action('use-mine'), {
        repair: {
          ...placementCase,
          mine: { value: 'Office 04', source: 'iPhone', at: DESIGN_NOW },
        },
        device: "Joao's iPhone",
        detail,
      })
    ).toContain("Joao's iPhone's report does not name it");
  });

  it('blocks every repair write while offline', () => {
    const cases: readonly [WebAction['id'], RepairCase][] = [
      ['use-mine', identifiedPlacementCase()],
      ['save-fitting', identifiedArchivedCase()],
      ['change-type', identifiedTypeReplacementCase()],
      ['restore-reference', identifiedReferenceCase()],
    ];

    for (const [id, repair] of cases) {
      expect(
        blockedReasonFor(action(id), {
          repair,
          device: "Joao's iPhone",
          disabledReason: 'Web actions are unavailable offline.',
          detail,
        })
      ).toBe('Web actions are unavailable offline.');
    }
  });

  it('reports catalogue state and unmatched fields before other type-change reasons', () => {
    const repair = identifiedTypeReplacementCase();
    expect(
      blockedReasonFor(action('change-type'), {
        repair,
        device: "Joao's iPhone",
        detail,
        catalogueStatus: 'pending',
        changeType: null,
      })
    ).toBe('Loading the catalogue');
    expect(
      blockedReasonFor(action('change-type'), {
        repair,
        device: "Joao's iPhone",
        detail,
        catalogueStatus: 'error',
        changeType: null,
      })
    ).toBe('The catalogue did not load');
    expect(
      blockedReasonFor(action('change-type'), {
        repair,
        device: "Joao's iPhone",
        detail,
        catalogueStatus: 'success',
        changeType: {
          kind: 'unmatched',
          replacement: 'Router',
          fields: ['Wi-Fi standard', 'Ports'],
        },
      })
    ).toBe('No field on Router matches Wi-Fi standard and Ports.');
  });
});

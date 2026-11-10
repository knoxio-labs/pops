import { addressDraft, pointDraft } from './draft';

import type { ContactPointInput, FactChange } from '../contacts-api/types.gen';
import type { PersonSnapshot } from './contracts';
import type { PersonDraft, PointDraft } from './draft';

function pointInput(point: PointDraft): ContactPointInput {
  return {
    kind: point.kind,
    value: point.value,
    label: point.label || null,
    countryCode: point.kind === 'phone' ? point.countryCode || null : null,
  };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Submit only explicitly edited identities; absent draft rows remove exactly the selected observation. */
export function personChanges(before: PersonSnapshot, draft: PersonDraft): FactChange[] {
  const changes: FactChange[] = [];
  if (before.entity.name !== draft.name || (before.entity.notes ?? '') !== draft.notes) {
    changes.push({ action: 'setEntity', name: draft.name, notes: draft.notes || null });
  }
  return [...changes, ...pointChanges(before, draft), ...addressChanges(before, draft)];
}

function pointChanges(before: PersonSnapshot, draft: PersonDraft): FactChange[] {
  const changes: FactChange[] = [];
  for (const point of draft.points) {
    const previous = before.points.find((item) => item.id === point.id);
    const input = pointInput(point);
    if (!previous) changes.push({ action: 'addPoint', point: input });
    else if (!same(pointInput(pointDraft(previous)), input)) {
      changes.push({ action: 'editPoint', pointId: point.id, point: input });
    }
  }
  for (const point of before.points) {
    if (!draft.points.some((item) => item.id === point.id)) {
      changes.push({ action: 'removePoint', pointId: point.id });
    }
  }
  return changes;
}

function addressChanges(before: PersonSnapshot, draft: PersonDraft): FactChange[] {
  const changes: FactChange[] = [];
  for (const address of draft.addresses) {
    const previous = before.addresses.find((item) => item.id === address.id);
    const input = {
      value: address.value,
      label: address.label || null,
      city: address.city || null,
    };
    if (!previous) changes.push({ action: 'addAddress', address: input });
    else if (!same(addressDraft(previous), address)) {
      changes.push({ action: 'editAddress', addressId: address.id, address: input });
    }
  }
  for (const address of before.addresses) {
    if (!draft.addresses.some((item) => item.id === address.id)) {
      changes.push({ action: 'removeAddress', addressId: address.id });
    }
  }
  return changes;
}

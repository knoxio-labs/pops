import { expect, it } from 'vitest';

import { captureOrganisation, captureTargetAvailability } from './inbox-model';
import { captureSource, sourceCapture } from './test-utils';

it('classification alone stays unorganised while Contacts availability remains explicitly unverified', () => {
  const capture = sourceCapture({ classification: 'event' });
  const source = captureSource([capture]);
  expect(captureOrganisation(capture, source)).toBe('unorganised');
  source.associations.push({
    id: 1,
    tripId: 1,
    captureId: capture.id,
    target: { kind: 'contact', reference: { uri: 'pops:contacts/contact/opaque' } },
    provenance: 'existing',
    sourceRevision: 1,
    revision: 1,
    removedAt: null,
    createdAt: capture.createdAt,
    updatedAt: capture.updatedAt,
  });
  expect(captureOrganisation(capture, source)).toBe('unverified');
  const association = source.associations[0];
  if (!association) throw new Error('Missing association');
  expect(captureTargetAvailability(association.target, source)).toBe('unverified');
  expect(
    captureOrganisation(capture, source, (uri) =>
      uri === 'pops:contacts/contact/opaque' ? 'available' : 'unverified'
    )
  ).toBe('organised');
  expect(captureOrganisation(capture, source, () => 'missing')).toBe('unresolved');
  expect(captureOrganisation(capture, source)).toBe('unverified');
  association.target = { kind: 'idea', id: 999 };
  expect(captureTargetAvailability(association.target, source)).toBe('missing');
  expect(captureOrganisation(capture, source)).toBe('unresolved');
  association.removedAt = capture.createdAt;
  expect(captureOrganisation(capture, source)).toBe('unorganised');
});

import { expect, it } from 'vitest';

import { captureOrganisation } from './inbox-model';
import { captureSource, sourceCapture } from './test-utils';

it('classification alone stays unorganised and an unresolved Contacts owner reference stays unresolved', () => {
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
  expect(captureOrganisation(capture, source)).toBe('unresolved');
  const association = source.associations[0];
  if (!association) throw new Error('Missing association');
  association.removedAt = capture.createdAt;
  expect(captureOrganisation(capture, source)).toBe('unorganised');
});

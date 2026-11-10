import { expect, it } from 'vitest';

import { personDraft } from './draft';
import { personChanges } from './draft-changes';
import { personSnapshot } from './test-fixtures';

it('does not write unchanged provider evidence or derive city from address text', () => {
  const data = personSnapshot();
  const draft = personDraft(data);
  expect(draft.addresses[0]?.city).toBe('');
  expect(personChanges(data, draft)).toEqual([]);
});

it('edits and removes exact selected observations while preserving all other fields', () => {
  const data = personSnapshot();
  const draft = personDraft(data);
  const point = draft.points[0];
  const address = draft.addresses[0];
  if (!point || !address) throw new Error('Missing fixtures');
  draft.points = [{ ...point, kind: 'other', value: 'Opaque @ text', label: 'Custom' }];
  draft.addresses = [{ ...address, city: 'Unlisted literal city', label: 'Studio' }];
  expect(personChanges(data, draft)).toEqual([
    {
      action: 'editPoint',
      pointId: point.id,
      point: { kind: 'other', value: 'Opaque @ text', label: 'Custom', countryCode: null },
    },
    { action: 'removePoint', pointId: 'phone' },
    {
      action: 'editAddress',
      addressId: address.id,
      address: { value: address.value, label: 'Studio', city: 'Unlisted literal city' },
    },
  ]);
  expect(data.points[0]?.value).toBe('Marina@Example.test');
});

it('retains URL as its own kind and adds raw facts without client match keys or location inference', () => {
  const data = personSnapshot();
  const draft = personDraft(data);
  draft.points.push({
    id: 'new',
    kind: 'url',
    value: 'https://example.test/raw',
    label: '',
    countryCode: '',
  });
  draft.addresses.push({ id: 'new', value: 'Literal\naddress', label: '', city: '' });
  expect(personChanges(data, draft)).toEqual([
    {
      action: 'addPoint',
      point: { kind: 'url', value: 'https://example.test/raw', label: null, countryCode: null },
    },
    { action: 'addAddress', address: { value: 'Literal\naddress', label: null, city: null } },
  ]);
});

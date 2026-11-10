import { describe, expect, it } from 'vitest';

import { ArrangementRevisionBody } from '../arrangement-revision.js';
import { RentalInputSchema } from '../rental-schemas.js';
import { rentalsContract } from '../rentals.js';
import { responsibilitiesContract, ResponsibilitySchema } from '../responsibilities.js';

describe('Rental and responsibility source contracts', () => {
  it('accepts unknown, partial, equal and reversed date-only facts without inferred values', () => {
    expect(RentalInputSchema.parse({})).toEqual({});
    for (const input of [
      { start: '2028-02-29' },
      { end: '2028-02-29' },
      { start: '2028-02-29', end: '2028-02-29' },
      { start: '2028-03-01', end: '2028-02-29' },
      {
        provider: null,
        pickupVisitId: null,
        returnVisitId: null,
        start: null,
        end: null,
        status: null,
      },
      { provider: 'Recorded supplier', status: 'Reserved' },
    ])
      expect(RentalInputSchema.parse(input)).toEqual(input);
  });

  it.each([
    { provider: ' ' },
    { start: '2027-02-29' },
    { end: '2028-04-31' },
    { start: '2028-02-29T00:00:00Z' },
    { pickupVisitId: 0 },
    { returnVisitId: -1 },
    { status: 'Agreed' },
    { status: 'Booked' },
  ])('rejects invalid rental source %j', (input) => {
    expect(RentalInputSchema.safeParse(input).success).toBe(false);
  });

  it('accepts only typed self or Contacts-issued contact references and explicit clear', () => {
    const contact = {
      kind: 'contact',
      uri: 'pops:contacts/contact/opaque+identity:%2Fkept#source',
    };
    expect(ResponsibilitySchema.parse(contact)).toEqual(contact);
    expect(ResponsibilitySchema.parse({ kind: 'self' })).toEqual({ kind: 'self' });
    expect(
      responsibilitiesContract.replace.body.parse({ expectedRevision: 2, responsibility: null })
    ).toEqual({ expectedRevision: 2, responsibility: null });
    for (const value of [
      { kind: 'contact', uri: 'https://example.test/person' },
      { kind: 'contact', uri: 'pops:documents/document/42' },
      { kind: 'contact', uri: 'pops:contacts/entity/42' },
      { kind: 'contact', uri: 'pops:contacts/contact/' },
      { kind: 'contact', uri: 'pops:contacts/contact/display name' },
      { kind: 'contact', uri: 'pops:contacts/contact/a/b' },
      { kind: 'operator' },
    ])
      expect(ResponsibilitySchema.safeParse(value).success).toBe(false);
    expect(responsibilitiesContract.replace.body.safeParse({ expectedRevision: 0 }).success).toBe(
      false
    );
    expect(
      responsibilitiesContract.get.pathParams.safeParse({
        tripId: 1,
        targetKind: 'leg',
        targetId: 1,
      }).success
    ).toBe(false);
  });

  it('requires exact safe revisions for patch, delete and responsibility replacement', () => {
    expect(ArrangementRevisionBody.parse({ expectedRevision: Number.MAX_SAFE_INTEGER })).toEqual({
      expectedRevision: Number.MAX_SAFE_INTEGER,
    });
    for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity])
      expect(ArrangementRevisionBody.safeParse({ expectedRevision }).success).toBe(false);
    expect(rentalsContract.update.body.safeParse({ provider: 'Recorded' }).success).toBe(false);
    expect(rentalsContract.delete.body.safeParse({}).success).toBe(false);
  });
});

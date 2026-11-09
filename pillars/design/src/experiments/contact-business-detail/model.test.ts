import { describe, expect, it } from 'vitest';

import { createBusinessState } from './fixture';
import {
  businessContactLabel,
  businessReferenceFindings,
  isBusinessWebsiteUrl,
  locationLabel,
  removeBusinessLocation,
  removeBusinessMethod,
  removeBusinessPerson,
  removeBusinessWebsite,
  saveBusinessLocation,
  saveBusinessMethod,
  saveBusinessPerson,
  saveBusinessWebsite,
  updateBusinessIdentity,
} from './model';

describe('business detail facts', () => {
  it('edits identity without changing source taxonomy, provenance, legacy or catalogues', () => {
    const state = createBusinessState('organisation');
    state.business.origin = 'Finance';
    state.business.legacy = { id: 'source', name: 'Source name', type: 'government' };
    const next = updateBusinessIdentity(state, { name: '  Associação São José  ', notes: '' });
    expect(next.business).toEqual({ ...state.business, name: 'Associação São José', notes: '' });
    expect(next.contacts).toBe(state.contacts);
    expect(next.arrangements).toBe(state.arrangements);
    expect(next.locations).toBe(state.locations);
    expect(next.people).toBe(state.people);
    expect(next.websites).toBe(state.websites);
    expect(state.business.name).toBe('Associação do Carmo');
    expect(updateBusinessIdentity(state, { name: ' \n ', notes: 'No save' })).toBe(state);
  });

  it('saves explicitly labelled free-form methods and removes only the requested method', () => {
    const state = createBusinessState();
    const input = { id: 'manual', label: '', value: '@carmo:example.test' };
    const added = saveBusinessMethod(state, input);
    expect(added.business.methods).toContainEqual(input);
    const updated = saveBusinessMethod(added, { ...input, label: 'Ask Lina', value: 'Front desk' });
    expect(updated.business.methods).toHaveLength(3);
    expect(updated.business.methods.at(-1)?.value).toBe('Front desk');
    expect(removeBusinessMethod(updated, input.id).business.methods).toEqual(
      state.business.methods
    );
    expect(saveBusinessMethod(state, { ...input, value: '  ' })).toBe(state);
    expect(saveBusinessMethod(state, { ...input, id: '' })).toBe(state);
    expect(removeBusinessMethod(state, 'unknown').business.methods).toEqual(state.business.methods);
  });

  it('accepts manual Unicode locations, optional fields, and label-only drafts', () => {
    const state = createBusinessState();
    const input = {
      id: 'manual',
      label: '',
      address: 'Travessa São João, s/n · fundos',
      city: '東京',
    };
    const added = saveBusinessLocation(state, input);
    expect(added.locations.at(-1)).toEqual(input);
    const labelOnly = { id: input.id, label: 'Meeting point', address: '', city: '' };
    const updated = saveBusinessLocation(added, labelOnly);
    expect(updated.locations).toHaveLength(3);
    expect(updated.locations.at(-1)).toEqual(labelOnly);
    expect(saveBusinessLocation(state, { id: 'empty', label: ' ', address: '', city: '' })).toBe(
      state
    );
    expect(saveBusinessLocation(state, { ...input, id: '' })).toBe(state);
    expect(state.locations).toHaveLength(2);
  });

  it.each([
    '',
    '  ',
    'javascript:alert(1)',
    'data:text/html,hello',
    'ftp://carmo.example.test',
    '/relative',
    'not a URL',
  ])('rejects unsafe or incomplete website %j', (url) => {
    const state = createBusinessState();
    expect(saveBusinessWebsite(state, { id: 'new', label: '', url })).toBe(state);
  });

  it('creates, updates and removes HTTP(S) websites with optional labels', () => {
    const state = createBusinessState();
    const input = { id: 'new', label: '', url: 'http://other.example.test/path' };
    const added = saveBusinessWebsite(state, input);
    expect(added.websites.at(-1)).toEqual(input);
    const updated = saveBusinessWebsite(added, { ...input, url: 'https://other.example.test' });
    expect(updated.websites).toHaveLength(2);
    expect(updated.websites.at(-1)?.url).toBe('https://other.example.test');
    expect(removeBusinessWebsite(updated, input.id).websites).toEqual(state.websites);
    expect(removeBusinessWebsite(state, 'unknown').websites).toEqual(state.websites);
    expect(saveBusinessWebsite(state, { ...input, id: '' })).toBe(state);
  });

  it.each([
    ['https://carmo.example.test', true],
    ['http://carmo.example.test/path?query=1#section', true],
    ['HTTPS://carmo.example.test', true],
    ['', false],
    [' \n ', false],
    ['//carmo.example.test', false],
    ['https://', false],
    ['javascript:alert(1)', false],
    ['data:text/html,hello', false],
    ['mailto:reception@carmo.example.test', false],
  ])('validates website presentation %j', (url, valid) => {
    expect(isBusinessWebsiteUrl(url)).toBe(valid);
  });
});

describe('independent references', () => {
  it('links only known contacts and optional known locations without interpreting roles', () => {
    const state = createBusinessState();
    const input = {
      id: 'association',
      contactId: 'marina-duarte',
      role: 'Comité · 夜間',
      locationId: '',
    };
    const added = saveBusinessPerson(state, input);
    expect(added.people.at(-1)).toEqual(input);
    const updated = saveBusinessPerson(added, { ...input, role: '', locationId: 'carmo-recife' });
    expect(updated.people).toHaveLength(3);
    expect(updated.people.at(-1)?.locationId).toBe('carmo-recife');
    expect(removeBusinessPerson(updated, input.id).people).toEqual(state.people);
    expect(updated.contacts).toBe(state.contacts);
    expect(updated.arrangements).toBe(state.arrangements);
    expect(saveBusinessPerson(state, { ...input, contactId: '' })).toBe(state);
    expect(saveBusinessPerson(state, { ...input, contactId: 'unknown' })).toBe(state);
    expect(saveBusinessPerson(state, { ...input, locationId: 'unknown' })).toBe(state);
    expect(saveBusinessPerson(state, { ...input, id: '' })).toBe(state);
    expect(removeBusinessPerson(state, 'unknown').people).toEqual(state.people);
  });

  it('edits roles while retaining unchanged unresolved references and findings', () => {
    const state = createBusinessState('missing-reference');
    const existing = state.people[0];
    if (!existing) throw new Error('Missing association fixture');
    const input = { ...existing, role: 'Night reception' };
    const updated = saveBusinessPerson(state, input);
    expect(updated).not.toBe(state);
    expect(updated.people).toEqual([input]);
    expect(state.people[0]?.role).toBe('Coordinator');
    expect(businessReferenceFindings(updated)).toEqual(businessReferenceFindings(state));
    expect(updated.contacts).toBe(state.contacts);
    expect(updated.locations).toBe(state.locations);
    expect(updated.arrangements).toBe(state.arrangements);
    expect(saveBusinessPerson(state, { ...input, id: 'new-association' })).toBe(state);
    expect(saveBusinessPerson(state, { ...input, contactId: 'another-missing-contact' })).toBe(
      state
    );
    expect(saveBusinessPerson(state, { ...input, locationId: 'another-missing-location' })).toBe(
      state
    );
    expect(saveBusinessPerson(state, { ...input, contactId: '' })).toBe(state);
    expect(saveBusinessPerson(state, { ...input, locationId: '' }).people[0]?.locationId).toBe('');
  });

  it('retains source arrangements and people when deleting their location', () => {
    const state = createBusinessState();
    const snapshot = structuredClone(state.arrangements);
    const removed = removeBusinessLocation(state, 'carmo-olinda');
    expect(removed.people).toBe(state.people);
    expect(removed.arrangements).toBe(state.arrangements);
    expect(removed.arrangements).toEqual(snapshot);
    expect(removed.contacts).toBe(state.contacts);
    expect(businessReferenceFindings(removed).map((finding) => finding.id)).toEqual([
      'person-location-manager',
      'arrangement-location-olinda-stay',
    ]);
    expect(removeBusinessLocation(state, 'unknown').locations).toEqual(state.locations);
  });

  it('renders unavailable references without exposing IDs and reports each broken source', () => {
    const state = createBusinessState('missing-reference');
    expect(locationLabel(state, '')).toBe('');
    expect(locationLabel(state, 'removed-location')).toBe('Location unavailable');
    expect(locationLabel(state, 'carmo-recife')).toBe(
      'Recife office · Rua da Aurora, 108 · Recife'
    );
    expect(businessContactLabel(state, 'removed-contact')).toBe('Contact unavailable');
    expect(businessContactLabel(state, 'marina-duarte')).toBe('Marina Duarte');
    state.arrangements = state.arrangements.map((arrangement) => ({
      ...arrangement,
      businessId: 'gone',
    }));
    const findings = businessReferenceFindings(state);
    expect(findings).toHaveLength(4);
    expect(findings.some((finding) => finding.id === 'arrangement-business-olinda-stay')).toBe(
      true
    );
    expect(findings.every((finding) => !finding.message.includes('removed-'))).toBe(true);
    expect(businessReferenceFindings(createBusinessState())).toEqual([]);
    expect(businessReferenceFindings(createBusinessState('empty'))).toEqual([]);
  });

  it('creates independent scenarios and keeps business address facts separate', () => {
    const first = createBusinessState();
    first.contacts.splice(0, 1);
    first.business.methods.splice(0, 1);
    const next = createBusinessState();
    expect(next.contacts).toHaveLength(2);
    expect(next.business.methods).toHaveLength(2);
    expect(next.business.addresses).toEqual([]);
    expect(createBusinessState('organisation').business.kind).toBe('organisation');
    expect(createBusinessState('empty').locations).toEqual([]);
    expect(createBusinessState('empty').people).toEqual([]);
    expect(createBusinessState('empty').arrangements).toEqual([]);
  });
});

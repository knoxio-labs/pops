import { initialDirectory } from '../contact-directory/fixture';

import type { DirectoryContact } from '../contact-directory/model';
import type { DuplicateScenario, DuplicateState } from './model';

function comparisonContact(): DirectoryContact {
  return {
    id: 'contact-marina-comparison',
    name: 'Marina B. Duarte',
    kind: 'person',
    aliases: ['Marina B.'],
    notes: 'Ask whether the studio address is still current.',
    methods: [{ id: 'm1', label: 'Email', value: 'marina@example.test' }],
    addresses: [{ id: 'a1', label: 'Mailing', city: 'Olinda', value: 'Rua do Sol, 24' }],
    origin: 'Contacts',
  };
}

/** Builds independent fictional, explicitly selected comparisons; shared facts are not matching evidence. */
export function createDuplicateState(scenario: DuplicateScenario = 'default'): DuplicateState {
  const contacts = initialDirectory().contacts;
  const comparison = comparisonContact();
  if (scenario === 'same-name') {
    comparison.name = 'Marina Duarte';
    comparison.methods = [{ id: 'm1', label: 'Studio', value: 'other-marina@example.test' }];
    comparison.addresses = [];
  }
  if (scenario === 'finance') {
    const legacy = {
      id: comparison.id,
      name: comparison.name,
      type: comparison.kind,
      aliases: ['M. B. Duarte'],
      notes: 'Reimburse workshop materials by transfer.',
      defaultTransactionType: 'expense',
      defaultTags: ['workshop'],
      colourId: 'violet',
    };
    comparison.origin = 'Finance';
    comparison.legacy = legacy;
    comparison.aliases = [...legacy.aliases];
    comparison.notes = legacy.notes;
  }
  const pairIds = ['contact-marina', comparison.id];
  return {
    contacts: scenario === 'missing-reference' ? contacts : [...contacts, comparison],
    pairIds: scenario === 'empty' ? [] : pairIds,
    retainedId: scenario === 'finance' ? comparison.id : 'contact-marina',
    nameSourceId: 'contact-marina',
    kindSourceId: comparison.id,
    references: [
      { id: 'dinner', title: 'Guaíba walk', pillar: 'Trips', contactId: 'contact-marina' },
      { id: 'workshop', title: 'Workshop materials', pillar: 'Finance', contactId: comparison.id },
      { id: 'unrelated', title: 'Clara’s visit', pillar: 'Trips', contactId: 'contact-clara' },
    ],
    separated: false,
  };
}

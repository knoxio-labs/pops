import { initialDirectory } from '../contact-directory/fixture';

import type { ContactPickerState, PickerScenario } from './model';

/** Builds independent fictional directory choices around a local birthday task draft. */
export function createContactPickerState(scenario: PickerScenario = 'default'): ContactPickerState {
  let directoryScenario: Parameters<typeof initialDirectory>[0] = 'default';
  if (scenario === 'empty') directoryScenario = 'empty';
  if (scenario === 'duplicate-names') directoryScenario = 'duplicate-names';
  const directory = initialDirectory(directoryScenario);
  let linkedIds = ['contact-clara'];
  if (scenario === 'empty') linkedIds = [];
  if (scenario === 'business') linkedIds = ['contact-pousada'];
  if (scenario === 'missing-reference') linkedIds = ['removed-contact'];
  return {
    contacts: directory.contacts,
    linkedIds,
    task: {
      title: 'Birthday in CWB · 16 December',
      date: '',
      notes: 'Confirm the birthday plans in CWB.',
    },
  };
}

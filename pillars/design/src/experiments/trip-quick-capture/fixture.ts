import type { CaptureState } from './model';

/** Named fictional states used to inspect the local capture prototype. */
export type CaptureScenario = 'default' | 'empty' | 'link' | 'document' | 'missing-reference';

/** Creates independent source records and actual browser files for each prototype mount. */
export function initialCapture(scenario: CaptureScenario): CaptureState {
  const state: CaptureState = {
    draft: { text: '', visitId: '', url: '', files: [] },
    items: [],
  };
  if (scenario === 'empty') return state;
  if (scenario === 'link') {
    state.draft.text = 'https://recife.example/festival';
    return state;
  }
  if (scenario === 'document') {
    state.draft.files = [
      new File(['Fictional Brazil trip notes\nExplore Recife on foot.\n'], 'brazil-notes.txt', {
        type: 'text/plain',
      }),
    ];
    return state;
  }
  state.items = [
    {
      id: 'capture-recife-note',
      text: 'Ask Clara about a walk along the waterfront.\nFind a morning that works for both of us.',
      kind: 'note',
      visitId: scenario === 'missing-reference' ? 'missing-visit-reference' : 'recife',
      url: '',
      files: [],
      title: '',
      start: '',
      end: '',
    },
    {
      id: 'capture-recife-link',
      text: 'Check the festival dates before choosing how long to stay in Recife.',
      kind: 'link',
      visitId: 'recife',
      url: 'https://recife.example/festival',
      files: [],
      title: '',
      start: '',
      end: '',
    },
  ];
  return state;
}

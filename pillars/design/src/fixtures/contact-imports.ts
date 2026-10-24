/** Fictional existing contacts retain distinct identities even when names match. */
export interface ContactCandidate {
  id: string;
  name: string;
  detail: string;
  source: string;
}

/** Fictional identity evidence shared by every contact import variant. */
export interface ContactImportRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: 'Google' | 'iCloud' | 'vCard';
  candidates: ContactCandidate[];
  evidence: string;
  outcome: 'Automatic merge' | 'New person' | 'Review required';
}

/** Deliberately includes distinct people sharing a complete name and incomplete names. */
export const contactImportRows: ContactImportRow[] = [
  {
    id: 'email',
    name: 'Mira Shah',
    email: 'mira@example.test',
    phone: '',
    source: 'Google',
    candidates: [{ id: 'mira', name: 'Mira Shah', detail: 'mira@example.test', source: 'POPS' }],
    evidence: 'Exact email',
    outcome: 'Automatic merge',
  },
  {
    id: 'phone',
    name: 'Theo Bell',
    email: '',
    phone: '+61 400 000 012',
    source: 'iCloud',
    candidates: [{ id: 'theo', name: 'Theodore Bell', detail: '+61 400 000 012', source: 'POPS' }],
    evidence: 'Exact phone',
    outcome: 'Automatic merge',
  },
  {
    id: 'full-name',
    name: 'Elena Park',
    email: 'elena@example.test',
    phone: '',
    source: 'vCard',
    candidates: [{ id: 'elena', name: 'Elena Park', detail: 'No email saved', source: 'POPS' }],
    evidence: 'Complete full name · one candidate',
    outcome: 'Automatic merge',
  },
  {
    id: 'ambiguous',
    name: 'Alex Morgan',
    email: 'alex.new@example.test',
    phone: '',
    source: 'Google',
    candidates: [
      {
        id: 'alex-design',
        name: 'Alex Morgan',
        detail: 'alex.design@example.test',
        source: 'iCloud',
      },
      {
        id: 'alex-music',
        name: 'Alex Morgan',
        detail: 'alex.music@example.test',
        source: 'Google',
      },
      {
        id: 'alex-studio',
        name: 'Alex Morgan',
        detail: 'alex.studio@example.test',
        source: 'vCard',
      },
    ],
    evidence: 'Same full name · identity needs review',
    outcome: 'Review required',
  },
  {
    id: 'first-name',
    name: 'Sam',
    email: 'sam.new@example.test',
    phone: '',
    source: 'iCloud',
    candidates: [],
    evidence: 'First name only · Sam Rivera is not a match',
    outcome: 'New person',
  },
  {
    id: 'separate',
    name: 'Robin Lee',
    email: 'robin.home@example.test',
    phone: '',
    source: 'vCard',
    candidates: [
      { id: 'robin', name: 'Robin Lee', detail: 'robin.work@example.test', source: 'POPS' },
    ],
    evidence: 'Keep separate · operator correction',
    outcome: 'Review required',
  },
];

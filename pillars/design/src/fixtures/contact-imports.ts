/** Fictional identity evidence shared by every contact import variant. */
export interface ContactImportRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: 'Google' | 'iCloud' | 'vCard';
  candidates: string[];
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
    candidates: ['Mira Shah · mira@example.test'],
    evidence: 'Exact email',
    outcome: 'Automatic merge',
  },
  {
    id: 'phone',
    name: 'Theo Bell',
    email: '',
    phone: '+61 400 000 012',
    source: 'iCloud',
    candidates: ['Theodore Bell · +61 400 000 012'],
    evidence: 'Exact phone',
    outcome: 'Automatic merge',
  },
  {
    id: 'full-name',
    name: 'Elena Park',
    email: 'elena@example.test',
    phone: '',
    source: 'vCard',
    candidates: ['Elena Park · no email'],
    evidence: 'Complete full name · one candidate',
    outcome: 'Automatic merge',
  },
  {
    id: 'ambiguous',
    name: 'Alex Morgan',
    email: 'alex.new@example.test',
    phone: '',
    source: 'Google',
    candidates: ['Alex Morgan · alex.design@example.test', 'Alex Morgan · alex.music@example.test'],
    evidence: 'Same complete name · two distinct people',
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
    candidates: ['Robin Lee · robin.work@example.test'],
    evidence: 'Keep separate · operator correction',
    outcome: 'Review required',
  },
];

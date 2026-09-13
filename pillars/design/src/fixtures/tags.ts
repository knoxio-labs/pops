/**
 * Fictional vocabulary for the finance Tags page (POPS-3690): every tag, how
 * many transactions carry it, and what applies it automatically. The set
 * covers a tag several rules and merchants apply, a tag applied only by
 * merchant defaults, one applied only by hand, one no transaction carries yet,
 * and a disabled rule.
 */
export type TagRuleMatchType = 'contains' | 'exact' | 'regex';

export interface TagSourceRule {
  id: string;
  pattern: string;
  matchType: TagRuleMatchType;
  isActive: boolean;
}

export interface TagSourceMerchant {
  id: string;
  name: string;
}

export interface VocabularyTag {
  tag: string;
  transactionCount: number;
  rules: TagSourceRule[];
  merchants: TagSourceMerchant[];
}

/** A stored tag split into its facet and value; a bare tag has no facet. */
export function splitTag(tag: string): { facet: string | null; value: string } {
  const separator = tag.indexOf(':');
  if (separator === -1) return { facet: null, value: tag };
  return { facet: tag.slice(0, separator), value: tag.slice(separator + 1) };
}

export const vocabularyTags: VocabularyTag[] = [
  {
    tag: 'venue:pub',
    transactionCount: 214,
    rules: [
      { id: 'r-harbour', pattern: 'HARBOUR HOTEL', matchType: 'contains', isActive: true },
      { id: 'r-anchor', pattern: 'THE ANCHOR', matchType: 'contains', isActive: true },
      { id: 'r-tavern', pattern: '^TAVERN ', matchType: 'regex', isActive: false },
    ],
    merchants: [
      { id: 'm-anchor', name: 'The Anchor' },
      { id: 'm-harbour', name: 'Harbour Hotel' },
    ],
  },
  {
    tag: 'venue:cafe',
    transactionCount: 131,
    rules: [{ id: 'r-roast', pattern: 'CORNER ROAST', matchType: 'contains', isActive: true }],
    merchants: [
      { id: 'm-kettle', name: 'Little Kettle' },
      { id: 'm-bean', name: 'Bean Shed' },
      { id: 'm-roast', name: 'Corner Roast' },
    ],
  },
  {
    tag: 'contains:groceries',
    transactionCount: 96,
    rules: [
      { id: 'r-woolworths', pattern: 'WOOLWORTHS', matchType: 'contains', isActive: true },
      { id: 'r-coles', pattern: 'COLES', matchType: 'contains', isActive: true },
    ],
    merchants: [],
  },
  {
    tag: 'subscriptions',
    transactionCount: 88,
    rules: [
      { id: 'r-streamly', pattern: 'STREAMLY', matchType: 'contains', isActive: true },
      { id: 'r-tunebox', pattern: 'TUNEBOX', matchType: 'contains', isActive: true },
    ],
    merchants: [{ id: 'm-cloudnest', name: 'Cloudnest' }],
  },
  {
    tag: 'channel:online',
    transactionCount: 61,
    rules: [],
    merchants: [{ id: 'm-parcelhub', name: 'Parcelhub' }],
  },
  {
    tag: 'fee:atm',
    transactionCount: 7,
    rules: [{ id: 'r-atm', pattern: 'ATM FEE', matchType: 'contains', isActive: true }],
    merchants: [],
  },
  { tag: 'occasion:birthday', transactionCount: 4, rules: [], merchants: [] },
  { tag: 'hobby:climbing', transactionCount: 0, rules: [], merchants: [] },
];

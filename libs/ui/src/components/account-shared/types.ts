/**
 * The account shape `AccountChip` and `AccountSelect` render. Lives apart
 * from both components, matching `entity-select/types.ts`'s split, so
 * neither has to import the other's module just to reuse the shape.
 *
 * Deliberately narrower than the finance pillar's wire schema: no balance or
 * currency, because POPS-2750 (balance checkpoints) has not shipped and a
 * design that shows a number it cannot back with real data is not one this
 * library should ship. `institution` is a joined object rather than the wire
 * `institutionId` string — resolving that id to a name and colour is the
 * caller's job, so this library never has to know how institutions are
 * fetched.
 */
export type AccountKind =
  | 'checking'
  | 'savings'
  | 'credit-card'
  | 'cash'
  | 'gift-card'
  | 'person'
  | 'shared'
  | 'loan'
  | 'novated-lease'
  | 'crypto'
  | 'other';

export interface AccountInstitution {
  id: string;
  name: string;
  colour: string;
  /** A resolved image URL. Absent when no logo has been uploaded, or none resolved yet. */
  logoUrl?: string;
}

export interface AccountOption {
  id: string;
  name: string;
  kind: AccountKind;
  /** Absent for cash and person ledgers, which have no issuing institution. */
  institution?: AccountInstitution;
  archived?: boolean;
}

import { SourceEditSession } from '../shared/source-edit-session';

import type { Rental, RentalPatch } from './types';

/** Complete editable Rental fields; the CAS revision comes only from the retained confirmed source. */
export type RentalFields = Omit<RentalPatch, 'expectedRevision'>;

/** Rental aggregate changes require explicit Reload rather than passive field-by-field rebasing. */
export class RentalEditSession extends SourceEditSession<Rental, RentalFields> {
  private confirmedReceipt: Rental | undefined;

  /** Keep only a response delivered by the shared command engine, separately from canonical reads. */
  recordReceipt(source: Rental): void {
    this.confirmedReceipt = ownedRental(source);
  }

  /** Stable own-response identity; a read or explicit Reload cannot create application proof. */
  receipt(): Rental | undefined {
    return this.confirmedReceipt;
  }

  /** Retain the confirmed aggregate when a background read observes a different revision. */
  override receive(source: Rental): void {
    if (source.revision === this.getState().saved.revision) super.receive(ownedRental(source));
  }
  /** Explicit Reload uses the shared monotonic identity check and discards only when no write is active. */
  override discard(source: Rental): Rental | undefined {
    return super.discard(ownedRental(source));
  }
}
/** Detach flat canonical Rental facts from mutable caller and cache aliases. */
export function ownedRental(source: Rental): Rental {
  return Object.freeze({ ...source });
}
/** Project only the existing canonical editable fields, preserving nulls and actual Visit identities. */
export function rentalFields(source: Rental): RentalFields {
  const { provider, pickupVisitId, returnVisitId, start, end, status } = source;
  return { provider, pickupVisitId, returnVisitId, start, end, status };
}

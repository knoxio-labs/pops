import type { MerchantIdentity } from '@/fixtures/purchases-merchant-spend';

/**
 * What to call a merchant group on screen.
 *
 * An entity group is not obliged to carry a label, so falling back to its id
 * keeps the row identifiable instead of blank — and keeps it distinguishable
 * from the unattributed group, which is a different statement entirely.
 */
export function merchantLabel(identity: MerchantIdentity): string {
  switch (identity.resolution) {
    case 'entity':
      return identity.name ?? `Unnamed merchant (${identity.entityId})`;
    case 'name':
      return identity.name;
    case 'unattributed':
      return 'No merchant named';
  }
}

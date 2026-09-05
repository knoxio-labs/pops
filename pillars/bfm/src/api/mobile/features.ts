/**
 * Which mobile surfaces exist, and which pillar each one needs.
 *
 * The one place a feature is declared. A surface the app can render is a bfm
 * concept rather than a pillar one — no pillar knows it is backing a phone
 * screen — so this table is authored here and nowhere else, and the phone
 * receives its consequences rather than its contents.
 *
 * `pillar` is a plain string, not a member of some compiled roster. There is
 * deliberately no fleet-wide tuple of pillar ids to check it against: the
 * registry is the source of truth for who exists, and a feature naming a
 * pillar that has never registered resolves to `unavailable` on its own,
 * which is the correct answer and needs no separate validation pass.
 */
import type {
  BootstrapFeature,
  BootstrapPillar,
  KnownMobileFeatureId,
} from '../../contract/rest-schemas.js';

interface MobileFeature {
  readonly id: KnownMobileFeatureId;
  readonly pillar: string;
}

export const MOBILE_FEATURES: readonly MobileFeature[] = [
  { id: 'transactions', pillar: 'finance' },
  { id: 'accounts', pillar: 'finance' },
  { id: 'purchases', pillar: 'purchases' },
  { id: 'receipt-capture', pillar: 'purchases' },
];

/**
 * Project probed pillar reachability onto the feature list.
 *
 * Every known feature is reported, always, carrying the state of the pillar
 * behind it. Omitting the unavailable ones would leave the app unable to tell
 * "finance is down, try again" from "this build is talking to a server that
 * has never heard of transactions", and those need different words on screen.
 *
 * A feature whose pillar is absent from the snapshot entirely is
 * `unavailable`: the registry is the roster, and a pillar not on it is not
 * reachable by definition.
 */
export function deriveFeatures(pillars: readonly BootstrapPillar[]): BootstrapFeature[] {
  const reachabilityByPillar = new Map(pillars.map((pillar) => [pillar.id, pillar.reachability]));
  return MOBILE_FEATURES.map((feature) => ({
    id: feature.id,
    reachability: reachabilityByPillar.get(feature.pillar) ?? 'unavailable',
  }));
}

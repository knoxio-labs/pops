/**
 * Cerebrum's settings key authority for the shared `@pops/pillar-settings`
 * surface (settings-federation S2).
 *
 * `deriveKeySet([cerebrumManifest])` is the single source of the declared key
 * set, the reset defaults, and the read-side sensitive set — cerebrum's own
 * manifest is the only authority for its keys (no central enum). The same
 * `KeyDefaults` feeds the contract's `:key` enum and the handler's declared-key
 * assertion + default resolution.
 */
import { deriveKeySet, type KeyDefaults } from '@pops/pillar-settings';

import { cerebrumManifest } from './index.js';

/** Cerebrum's effective {@link KeyDefaults}, derived from its own manifest. */
export const cerebrumKeyDefaults: KeyDefaults = deriveKeySet([cerebrumManifest]);

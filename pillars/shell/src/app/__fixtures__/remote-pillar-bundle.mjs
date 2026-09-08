/**
 * A remote pillar bundle, hand-written, in the shape a pillar's remote build
 * emits: one ESM module whose only export is a `bundles` record of
 * zero-prop components, importing React from the host rather than containing
 * it (the shared-runtime contract in `../external-ui.tsx`).
 *
 * It exists so `defaultRemoteModuleImporter` — the production loader — can be
 * exercised against a real module rather than an object literal. A built
 * pillar bundle would be the more faithful subject and is tested as one by
 * its own package (`pillars/purchases/app/src/__tests__/remote-bundle.test.ts`);
 * pointing the shell's suite at another package's build output would make it
 * fail for reasons that are not the shell's.
 */
import { jsx } from 'react/jsx-runtime';

export const bundles = {
  home: () => jsx('div', { 'data-testid': 'imported-from-disk', children: 'from disk' }),
};

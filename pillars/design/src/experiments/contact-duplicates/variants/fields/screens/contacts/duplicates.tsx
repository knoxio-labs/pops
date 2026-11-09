import { DuplicateWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Preview-only duplicate contact comparison with explicit independent field choices. */
export const meta: ScreenMeta = { title: 'Duplicate contact preview', order: 8, frame: 'web' };

/** Fictional paired identities, same-name records, Finance provenance and unavailable-source states. */
export const states: ScreenStates = {
  default: () => <DuplicateWorkspace layout="fields" />,
  'same-name': () => <DuplicateWorkspace layout="fields" scenario="same-name" />,
  finance: () => <DuplicateWorkspace layout="fields" scenario="finance" />,
  'missing-reference': () => <DuplicateWorkspace layout="fields" scenario="missing-reference" />,
  empty: () => <DuplicateWorkspace layout="fields" scenario="empty" />,
};

/** Opens the fields-first read-only merge proposal. */
export default function DuplicateScreen() {
  return <DuplicateWorkspace layout="fields" />;
}

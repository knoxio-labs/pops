import { Button } from '@pops/ui';

import type { JSX } from 'react';

/** Require an explicit choice before replacing fields changed both locally and by a canonical refresh. */
export function SourceConflict({
  conflict,
  reset,
}: {
  conflict: boolean;
  reset: () => void;
}): JSX.Element | null {
  return conflict ? (
    <section role="alert" className="space-y-2 rounded-lg border border-border p-3">
      <p>Source values changed while you were editing. Conflicting edits have not been saved.</p>
      <Button variant="outline" onClick={reset}>
        Use refreshed values for conflicting fields
      </Button>
    </section>
  ) : null;
}

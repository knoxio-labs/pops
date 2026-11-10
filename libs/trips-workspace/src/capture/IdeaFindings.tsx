import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

import { ideaFindingInput, ideaFindings } from './idea-findings';

import type { JSX } from 'react';

import type { IdeaFieldProps } from './idea-field-types';

/** Explain explicit source discrepancies while leaving optional facts editable and independently saveable. */
export function IdeaFindings({
  value,
  context,
}: Pick<IdeaFieldProps, 'value' | 'context'>): JSX.Element {
  return (
    <div className="space-y-2">
      {ideaFindings(ideaFindingInput(value), context.places.data, context.visits.data).map(
        (finding) => (
          <Alert key={finding.id} aria-label={finding.title}>
            <AlertTitle>{finding.title}</AlertTitle>
            <AlertDescription>{finding.detail}</AlertDescription>
          </Alert>
        )
      )}
    </div>
  );
}

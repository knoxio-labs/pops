import { Route } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

/**
 * The traversal-limit state: a read already follows two references, so the
 * way past is a computed field on the type it stands on.
 */
export function HopLimitNotice({
  typeLabel,
  nextReference,
}: {
  typeLabel: string;
  nextReference: string | undefined;
}) {
  return (
    <Alert>
      <Route />
      <AlertTitle>Reads stop at two references</AlertTitle>
      <AlertDescription>
        {nextReference === undefined
          ? `${typeLabel} has no references to follow.`
          : `To reach past ${nextReference}, add a computed field on ${typeLabel} that reads it, then read that field here.`}
      </AlertDescription>
    </Alert>
  );
}

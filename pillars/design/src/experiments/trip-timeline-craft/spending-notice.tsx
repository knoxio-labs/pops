import { CircleHelp } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

/** Keeps incomplete Finance or trip-link states visible beside the relevant action. */
export function SpendingNotice({ title, description }: { title: string; description: string }) {
  return (
    <Alert>
      <CircleHelp aria-hidden />
      <AlertTitle className="line-clamp-none whitespace-normal break-words">{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

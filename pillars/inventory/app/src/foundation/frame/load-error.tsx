import { Button, Card } from '@pops/ui';

import type { ReactElement } from 'react';

/** Renders a failed load card with readable detail and a retry action. */
export function LoadError({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <Card
      role="alert"
      className="mx-auto mt-6 w-full max-w-md items-center gap-3 px-6 py-8 text-center"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </Card>
  );
}

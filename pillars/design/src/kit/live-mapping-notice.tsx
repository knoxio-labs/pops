import { ImportContextStrip } from '@/screens/finance/import/upload';
import { Check } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button, PageHeader } from '@pops/ui';

import type { ImportChoice } from '@/screens/finance/import/context';

const FIELDS: Array<{ field: string; from: string }> = [
  { field: 'Date', from: 'settledAt, falling back to createdAt while a row is held' },
  { field: 'Description', from: 'description' },
  { field: 'Amount', from: 'amount.valueInBaseUnits, signed as Up sends it' },
  { field: 'Merchant', from: 'rawText, when Up carries one' },
  { field: 'Bank id', from: 'the transaction id — the dedup key' },
];

/**
 * A live feed has no columns to map: the provider's API is one fixed
 * shape, and the mapping is code, not a choice. The step still exists so
 * the person can see what the mapping IS and that it is not theirs to
 * change — a wizard that silently skips a step reads as broken.
 */
export function LiveMappingNotice({ provider }: { provider: string }) {
  return (
    <Alert>
      <Check aria-hidden />
      <AlertTitle>{provider} rows arrive already mapped</AlertTitle>
      <AlertDescription>
        <p>There is nothing to map by hand. Each field is read from the same place every time:</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {FIELDS.map(({ field, from }) => (
            <div key={field} className="contents">
              <dt className="font-medium">{field}</dt>
              <dd className="text-muted-foreground">{from}</dd>
            </div>
          ))}
        </dl>
      </AlertDescription>
    </Alert>
  );
}

/** The whole Map step for a feed: the notice, and the way on. */
export function LiveMapStep({ choice }: { choice: ImportChoice }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader title="Map columns" description="Not needed for a live feed." />
      <ImportContextStrip choice={choice} />
      <LiveMappingNotice provider={choice.account.name.split(' ')[0] ?? 'Up'} />
      <div className="flex justify-between gap-3">
        <Button variant="outline">Back</Button>
        <Button>Next</Button>
      </div>
    </div>
  );
}

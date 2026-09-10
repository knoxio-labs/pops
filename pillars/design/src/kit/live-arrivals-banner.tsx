import { Radio } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

/**
 * Rows the bank sent after this import was opened do not appear in it. A
 * review whose tabs change under the person reviewing is one where a
 * decision was made about a row that has since moved; the arrivals wait in
 * the next pending import, and this banner is the only sign of them here.
 */
export function LiveArrivals({ count }: { count: number }) {
  return (
    <Alert>
      <Radio aria-hidden />
      <AlertTitle>
        {count === 1 ? '1 more transaction has' : `${count} more transactions have`} arrived from Up
      </AlertTitle>
      <AlertDescription>
        <p>
          They are waiting in the next pending import, so nothing here has moved. Finish this one
          and it will be on the dashboard.
        </p>
      </AlertDescription>
    </Alert>
  );
}

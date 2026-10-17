import { shortLabelContents } from '@/fixtures/inventory/label-contents-layout';
import { useState } from 'react';

import { Switch } from '@pops/ui';

import { LabelContentsPreview } from './label-contents-layout';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactElement } from 'react';

function FragileLabelReview({ detected = false }: { detected?: boolean }): ReactElement {
  const [manual, setManual] = useState(false);
  const fragile = detected || manual;

  return (
    <main className="min-h-screen bg-muted p-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
        <div className="w-full space-y-3 rounded-lg border bg-background p-4">
          <h1 className="text-lg font-semibold">Fragile label</h1>
          <p className="text-sm text-muted-foreground">
            A fragile item anywhere inside this item, including nested containers, adds the warning.
          </p>
          <div className="flex min-h-11 items-center justify-between gap-4">
            <label
              htmlFor="fragile-label"
              className="flex min-h-11 flex-1 items-center text-sm font-medium"
            >
              Fragile
            </label>
            <Switch
              id="fragile-label"
              checked={fragile}
              onCheckedChange={setManual}
              disabled={detected}
              aria-describedby="fragile-reason"
            />
          </div>
          <p id="fragile-reason" className="text-sm text-muted-foreground">
            {detected
              ? 'A nested item is marked fragile. This warning stays on.'
              : 'Turn on to add the warning when fragility has not been recorded.'}
          </p>
          <p className="text-xs text-muted-foreground">
            99.1 × 139 mm label · 32 mm QR · 32 mm fragile symbol
          </p>
        </div>
        <LabelContentsPreview columns={1} contents={shortLabelContents} fragile={fragile} />
      </div>
    </main>
  );
}

/** Review metadata for the inventory label's handling warning. */
export const meta: ScreenMeta = { title: 'Fragile label', order: 20, frame: 'none' };

/** Shows the automatic warning inherited from a nested fragile item. */
export const states: ScreenStates = {
  'fragile-descendant': () => <FragileLabelReview detected />,
};

/** Reviews a manual warning when the item's tree has no recorded fragility. */
export default function FragileLabelScreen(): ReactElement {
  return <FragileLabelReview />;
}

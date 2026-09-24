import { CircleSlash, FlaskConical, RefreshCw, TriangleAlert } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@pops/ui';

import { unavailableSentence } from '../expression/preview-copy';
import { PreviewDetails, TraversedItems } from './PreviewDetails';

import type { PreviewItem, PreviewState } from './preview-model';

const PICKER_OFF: ReadonlySet<PreviewState['state']> = new Set([
  'no-draft',
  'no-expression',
  'no-items',
  'invalid',
]);

const MESSAGES: Partial<Record<PreviewState['state'], string>> = {
  'no-draft': 'The catalogue has no published revision yet, so there is nothing to try this on.',
  'no-expression': 'Finish every empty slot to try the expression.',
  invalid: 'Fix the flagged node to try the expression.',
  idle: 'Pick an item to calculate this field for it.',
};

function ItemPicker({
  preview,
  items,
  itemId,
  onPick,
}: {
  preview: PreviewState;
  items: readonly PreviewItem[];
  itemId: string | null;
  onPick: (itemId: string) => void;
}) {
  return (
    <SelectPrimitive
      value={itemId ?? undefined}
      onValueChange={(next) => {
        if (next !== '') onPick(next);
      }}
      disabled={PICKER_OFF.has(preview.state)}
    >
      <SelectTrigger className="min-h-11 sm:w-64" aria-label="Item to try">
        <SelectValue placeholder="Pick an item" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive>
  );
}

function Evaluated({
  preview,
}: {
  preview: Extract<PreviewState, { state: 'value' | 'unavailable' | 'evaluation-error' }>;
}) {
  return (
    <div className="space-y-1" aria-live="polite">
      {preview.state === 'value' && (
        <>
          <p className="text-2xl font-semibold tabular-nums">{preview.value}</p>
          <p className="text-sm text-muted-foreground">{preview.workings}</p>
          {preview.override !== undefined && (
            <p className="text-xs text-muted-foreground">
              {preview.item.label} shows {preview.override} today because of an override. This is
              what it calculates once the override is cleared.
            </p>
          )}
        </>
      )}
      {preview.state === 'unavailable' && (
        <>
          <p className="flex items-center gap-2 text-lg font-semibold">
            <CircleSlash className="h-5 w-5 text-muted-foreground" />
            Unavailable
          </p>
          <p className="text-sm">{unavailableSentence(preview.missingInputs)}</p>
          <TraversedItems items={preview.traversed} />
        </>
      )}
      {preview.state === 'evaluation-error' && (
        <>
          <p className="text-lg font-semibold text-destructive">Could not be calculated</p>
          <p className="text-sm">{preview.sentence}</p>
        </>
      )}
      <PreviewDetails dependencies={preview.dependencies} traversed={preview.traversed} />
    </div>
  );
}

function Outcome({ preview, onRetry }: { preview: PreviewState; onRetry: () => void }) {
  const message = MESSAGES[preview.state];
  if (message !== undefined) return <p className="text-sm text-muted-foreground">{message}</p>;
  switch (preview.state) {
    case 'no-items':
      return (
        <p className="text-sm text-muted-foreground">
          There are no {preview.typeLabel} items yet. The preview needs one to calculate against.
        </p>
      );
    case 'loading':
      return (
        <div className="space-y-2" aria-label={`Calculating for ${preview.item.label}`}>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
      );
    case 'request-error':
      return (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Preview failed</AlertTitle>
          <AlertDescription>
            The calculation did not run. Nothing was saved and the draft is unchanged.
          </AlertDescription>
          <div className="col-start-2 mt-2">
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </Alert>
      );
    case 'value':
    case 'unavailable':
    case 'evaluation-error':
      return <Evaluated preview={preview} />;
    default:
      return null;
  }
}

/**
 * Evaluates the unsaved draft expression against one item the author picks.
 * It never writes: not the item, not the draft, not an override.
 */
export function ResultPreview({
  preview,
  items,
  itemId,
  onPick,
  onRetry,
}: {
  preview: PreviewState;
  items: readonly PreviewItem[];
  itemId: string | null;
  onPick: (itemId: string) => void;
  onRetry: () => void;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Try on an item">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Try on an item</h4>
          <span className="text-xs text-muted-foreground">Nothing is saved</span>
        </div>
        <ItemPicker preview={preview} items={items} itemId={itemId} onPick={onPick} />
      </div>
      <Outcome preview={preview} onRetry={onRetry} />
    </section>
  );
}

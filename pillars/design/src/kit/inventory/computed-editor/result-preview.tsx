import { CircleSlash, FlaskConical, RefreshCw, TriangleAlert } from 'lucide-react';

import { evaluationErrorSentence, unavailableSentence } from '@pops/app-inventory/design';
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

import { PreviewDetails, TraversedItems } from './preview-details';

import type { PreviewItem, PreviewState } from './scenario';

function selectedItem(preview: PreviewState): PreviewItem | undefined {
  return 'item' in preview ? preview.item : undefined;
}

function ItemPicker({ preview, items }: { preview: PreviewState; items: readonly PreviewItem[] }) {
  const disabled =
    preview.state === 'no-expression' ||
    preview.state === 'no-items' ||
    preview.state === 'invalid';
  return (
    <SelectPrimitive defaultValue={selectedItem(preview)?.id} disabled={disabled}>
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

function Outcome({ preview }: { preview: PreviewState }) {
  switch (preview.state) {
    case 'no-expression':
      return (
        <p className="text-sm text-muted-foreground">
          Finish every empty slot to try the expression.
        </p>
      );
    case 'invalid':
      return (
        <p className="text-sm text-muted-foreground">Fix the flagged node to try the expression.</p>
      );
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
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </Alert>
      );
    default:
      return <Evaluated preview={preview} />;
  }
}

function Evaluated({
  preview,
}: {
  preview: Extract<PreviewState, { state: 'value' | 'unavailable' | 'evaluation-error' }>;
}) {
  return (
    <div className="space-y-1">
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
          <p className="text-sm">
            {unavailableSentence(preview.reason, preview.missingField, preview.missingOn)}
          </p>
          <TraversedItems items={preview.traversed} />
        </>
      )}
      {preview.state === 'evaluation-error' && (
        <>
          <p className="text-lg font-semibold text-destructive">Could not be calculated</p>
          <p className="text-sm">{evaluationErrorSentence(preview.code)}</p>
        </>
      )}
      <PreviewDetails
        dependencies={preview.dependencies}
        traversed={preview.traversed}
        open={preview.detailsOpen === true}
      />
    </div>
  );
}

/**
 * Evaluates the unsaved draft expression against one item the author picks.
 * It never writes: not the item, not the draft, not an override.
 */
export function ResultPreview({
  preview,
  items,
}: {
  preview: PreviewState;
  items: readonly PreviewItem[];
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Try on an item">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Try on an item</h4>
          <span className="text-xs text-muted-foreground">Nothing is saved</span>
        </div>
        <ItemPicker preview={preview} items={items} />
      </div>
      <Outcome preview={preview} />
    </section>
  );
}

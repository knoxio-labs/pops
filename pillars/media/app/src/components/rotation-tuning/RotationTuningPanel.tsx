/**
 * RotationTuningPanel — the `rotation-tuning` settings widget.
 *
 * Mounted by the shell into the `media.rotation` section. The removal ranking
 * used to be four constants in a source file, fitted against a snapshot in
 * which two of its three signals were broken; the numbers were never worth the
 * confidence a constant implies. This turns them into sliders with the one
 * thing that makes tuning them possible — the ranking they produce, recomputed
 * live and before anything is saved.
 */
import { Loader2, RotateCcw } from 'lucide-react';

import { Alert, AlertDescription, Button, Slider } from '@pops/ui';

import { TUNING_FIELDS, useRotationTuning } from './useRotationTuning';

import type { PreviewMovie, PreviewState, RotationTuningModel } from './useRotationTuning';

/**
 * One knob. The row is a labelled `group` rather than a `<label htmlFor>`:
 * the shared Slider renders a Radix root whose focusable thumb is a nested
 * span, so an `htmlFor` would point at nothing and the control would be
 * unnamed. Naming the group names the control that lives inside it.
 */
function TuningSlider({
  field,
  value,
  onChange,
}: {
  field: (typeof TUNING_FIELDS)[number];
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1.5" role="group" aria-label={field.label}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{field.label}</span>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">{value}</span>
      </div>
      <Slider
        min={field.min}
        max={field.max}
        step={field.step}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
      />
      <p className="text-xs text-muted-foreground">{field.hint}</p>
    </div>
  );
}

function PreviewDetail({ movie }: { movie: PreviewMovie }) {
  const watched = movie.watchCount === 0 ? 'unwatched' : `watched ${movie.watchCount}×`;
  const abandoned =
    movie.abandonedProgress === null
      ? null
      : `abandoned at ${Math.round(movie.abandonedProgress * 100)}%`;
  return (
    <span className="text-xs text-muted-foreground">
      {Math.round(movie.ageDays)}d · {watched}
      {abandoned && <> · {abandoned}</>} · quality {movie.quality.toFixed(2)} ({movie.qualitySource}
      ) · {movie.sizeGb.toFixed(1)} GB
    </span>
  );
}

function PreviewList({ preview }: { preview: PreviewState }) {
  if (preview.skippedReason) {
    return (
      <Alert>
        <AlertDescription>{preview.skippedReason}</AlertDescription>
      </Alert>
    );
  }
  if (preview.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{preview.error}</AlertDescription>
      </Alert>
    );
  }
  if (preview.isLoading) {
    return <p className="text-sm text-muted-foreground">Scoring the library…</p>;
  }
  if (preview.movies.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing is eligible for removal.</p>;
  }
  return (
    <ol className={preview.isStale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {preview.movies.map((movie) => (
        <li key={movie.tmdbId} className="border-b py-1.5 last:border-b-0">
          <div className="flex items-baseline gap-2">
            <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
              {movie.rank}
            </span>
            <span className={movie.inNextBatch ? 'text-sm font-medium' : 'text-sm'}>
              {movie.title}
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs tabular-nums">
              {Math.round(movie.pressure)}
            </span>
          </div>
          <div className="pl-8">
            <PreviewDetail movie={movie} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function ResetQueueControl({ model }: { model: RotationTuningModel }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
      <Button
        variant="outline"
        size="sm"
        onClick={model.resetQueue}
        disabled={model.isResettingQueue}
        data-testid="rotation-tuning-reset-queue"
      >
        {model.isResettingQueue ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="mr-2 h-4 w-4" />
        )}
        Reset removal queue
      </Button>
      <p className="text-xs text-muted-foreground">
        {model.clearedCount === null
          ? 'Un-marks every film waiting to be removed. Deletes nothing — they go back in the pool and are ranked again next cycle.'
          : `Un-marked ${model.clearedCount} ${model.clearedCount === 1 ? 'film' : 'films'}. Nothing was deleted.`}
      </p>
    </div>
  );
}

export function RotationTuningPanel() {
  const model = useRotationTuning();
  const { values, preview } = model;

  if (!values) return <p className="text-sm text-muted-foreground">Loading rotation settings…</p>;

  return (
    <div className="space-y-6" data-testid="rotation-tuning">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-5">
          {TUNING_FIELDS.map((field) => (
            <TuningSlider
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(next) => model.setValue(field.key, next)}
            />
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-sm font-medium">Next out</h4>
            <span className="text-xs text-muted-foreground">
              {preview.removableCount} of {preview.eligibleCount} removable
            </span>
          </div>
          <PreviewList preview={preview} />
          {preview.movies.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {preview.markedNow === 0
                ? 'Nothing needs removing right now — this is the order it would happen in.'
                : `The next cycle would take the first ${preview.markedNow}, shown in bold.`}
            </p>
          )}
        </div>
      </div>

      {model.saveError && (
        <Alert variant="destructive">
          <AlertDescription>{model.saveError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={model.save} disabled={!model.isDirty || model.isSaving}>
          {model.isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
        <Button variant="ghost" onClick={model.reset} disabled={!model.isDirty}>
          Discard changes
        </Button>
        <p className="text-xs text-muted-foreground">
          {model.isDirty
            ? 'Unsaved — the preview shows these values; the next cycle still uses the saved ones.'
            : 'Saved. Applies from the next rotation cycle.'}
        </p>
      </div>

      <ResetQueueControl model={model} />
    </div>
  );
}

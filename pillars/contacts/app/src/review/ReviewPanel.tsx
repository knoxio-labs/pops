import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Skeleton } from '@pops/ui';

import { describeContactError } from '../errors';
import { Comparison } from './Comparison';
import { emptyChoices, type ReviewChoices, type ReviewItem } from './model';
import { ReviewQueue } from './ReviewQueue';
import { useReview } from './useReview';

import type { TFunction } from 'i18next';

import type { ReviewGateway, ReviewSnapshot } from './contracts';

/** Review one durable import batch with an atomic save, explicit retries and stale-evidence recovery. */
export function ReviewPanel({ batchId, gateway }: { batchId: string; gateway: ReviewGateway }) {
  const { t } = useTranslation('contacts');
  const model = useReview(batchId, gateway);
  return (
    <div className="space-y-6">
      {model.error && (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive p-4">
          <p>{describeContactError(model.error, t)}</p>
          <div className="flex flex-wrap gap-2">
            {model.uncertain && (
              <Button disabled={model.saving} onClick={() => void model.retry()}>
                {t('review.retry')}
              </Button>
            )}
            <Button variant="outline" disabled={model.saving} onClick={() => void model.reload()}>
              {t('review.reload')}
            </Button>
          </div>
          <p className="text-sm">{t('review.reloadHint')}</p>
        </div>
      )}
      {model.success && (
        <p role="status" className="text-base font-semibold">
          {t('review.saved')}
        </p>
      )}
      {model.isPending && (
        <div aria-label={t('review.loading')} className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {model.data && model.data.items.length === 0 && (
        <p className="text-base">{t('review.empty')}</p>
      )}
      {model.data && model.data.items.length > 0 && (
        <Workspace
          key={model.generation}
          snapshot={model.data}
          onRowsPage={model.pageRows}
          onCandidatesPage={model.pageCandidates}
          disabled={isBlocked(model)}
          onSave={(item, choices) => void model.save(item, choices)}
        />
      )}
    </div>
  );
}

interface WorkspaceProps {
  snapshot: ReviewSnapshot;
  onRowsPage: (offset: number) => void;
  onCandidatesPage: (rowId: string, offset: number) => void;
  disabled: boolean;
  onSave: (item: ReviewItem, choices: ReviewChoices) => void;
}

function Workspace({ snapshot, onRowsPage, onCandidatesPage, disabled, onSave }: WorkspaceProps) {
  const { t } = useTranslation('contacts');
  const items = snapshot.items;
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const [choices, setChoices] = useState<Record<string, ReviewChoices>>({});
  const item = items.find((entry) => entry.id === selectedId) ?? items[0];
  if (!item) return null;
  const selectedChoices = choices[item.id] ?? {
    ...emptyChoices(),
    candidates: item.initialChoices ?? {},
  };
  const selectedCount = Object.values(selectedChoices.candidates).filter(
    (choice) => choice === 'merge'
  ).length;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ReviewQueue
        snapshot={snapshot}
        onPage={onRowsPage}
        selectedId={item.id}
        disabled={disabled}
        onSelect={setSelectedId}
      />
      <div className="space-y-4 lg:col-span-2">
        <Comparison
          item={item}
          onCandidatesPage={(offset) => onCandidatesPage(item.id, offset)}
          choices={selectedChoices}
          disabled={disabled}
          onChange={(value) => setChoices({ ...choices, [item.id]: value })}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={disabled || item.errors.length > 0}
            onClick={() => onSave(item, selectedChoices)}
          >
            {saveLabel(selectedCount, item, t)}
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              const index = items.findIndex((entry) => entry.id === item.id);
              setSelectedId(items[(index + 1) % items.length]?.id);
            }}
          >
            {t('review.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function saveLabel(count: number, item: ReviewItem, t: TFunction<'contacts'>): string {
  if (count > 0) return t('review.mergeSelected', { count });
  if (item.processed) return t('review.save');
  if (item.ingestionAction === 'deactivate_source') return t('review.removeSource');
  if (item.ingestionAction === 'update_source') return t('review.updateSource');
  return t('review.create');
}

function isBlocked(model: ReturnType<typeof useReview>): boolean {
  return model.saving || model.stale || model.uncertain || model.isFetching || model.error !== null;
}

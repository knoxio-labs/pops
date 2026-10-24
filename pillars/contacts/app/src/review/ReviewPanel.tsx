import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { Comparison } from './Comparison';
import { emptyChoices, type ReviewChoices, type ReviewItem } from './model';
import { ReadyAction, ReadyCounts } from './ReadyControls';
import { ReviewFeedback } from './ReviewFeedback';
import { ReviewQueue } from './ReviewQueue';
import { useReview } from './useReview';

import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';

import type { ReviewGateway, ReviewSnapshot } from './contracts';

type DraftChoices = Record<string, ReviewChoices>;

/** Review one durable import batch with an atomic save, explicit retries and stale-evidence recovery. */
export function ReviewPanel({
  batchId,
  gateway,
  renderHeader,
}: {
  batchId: string;
  gateway: ReviewGateway;
  renderHeader?: (actions: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation('contacts');
  const [drafts, setDrafts] = useState<DraftChoices>({});
  const model = useReview(batchId, gateway, (operation) => {
    if (operation.kind === 'row')
      setDrafts((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== operation.request.rowId))
      );
  });
  const dirty = Object.keys(drafts).length > 0;
  function reload() {
    setDrafts({});
    void model.reload();
  }
  const action = (
    <ReadyAction
      ready={model.data?.ready}
      disabled={isBlocked(model)}
      applying={model.readyApplying}
      dirty={dirty}
      onApply={() => void model.applyReady()}
      onReload={reload}
    />
  );
  return (
    <div className="space-y-6">
      {renderHeader ? renderHeader(action) : action}
      {model.data && <ReadyCounts ready={model.data.ready} />}
      <ReviewFeedback model={model} onReload={reload} />
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
          drafts={drafts}
          onChoicesChanged={(rowId, value) =>
            setDrafts((current) => ({ ...current, [rowId]: value }))
          }
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
  drafts: DraftChoices;
  onChoicesChanged: (rowId: string, choices: ReviewChoices) => void;
}

function Workspace({
  snapshot,
  onRowsPage,
  onCandidatesPage,
  disabled,
  onSave,
  onChoicesChanged,
  drafts,
}: WorkspaceProps) {
  const items = snapshot.items;
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const item = items.find((entry) => entry.id === selectedId) ?? items[0];
  if (!item) return null;
  const selectedChoices = drafts[item.id] ?? {
    ...emptyChoices(),
    candidates: item.initialChoices ?? {},
  };
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ReviewQueue
        snapshot={snapshot}
        onPage={onRowsPage}
        selectedId={item.id}
        disabled={disabled}
        onSelect={setSelectedId}
      />
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <Comparison
          item={item}
          onCandidatesPage={(offset) => onCandidatesPage(item.id, offset)}
          choices={selectedChoices}
          disabled={disabled}
          onChange={(value) => {
            onChoicesChanged(item.id, value);
          }}
        />
        <WorkspaceActions
          item={item}
          choices={selectedChoices}
          disabled={disabled}
          onSave={onSave}
          onNext={() => {
            const index = items.findIndex((entry) => entry.id === item.id);
            setSelectedId(items[(index + 1) % items.length]?.id);
          }}
        />
      </div>
    </div>
  );
}

function WorkspaceActions({
  item,
  choices,
  disabled,
  onSave,
  onNext,
}: {
  item: ReviewItem;
  choices: ReviewChoices;
  disabled: boolean;
  onSave: WorkspaceProps['onSave'];
  onNext: () => void;
}) {
  const { t } = useTranslation('contacts');
  const count = Object.values(choices.candidates).filter((choice) => choice === 'merge').length;
  return (
    <div className="flex flex-wrap gap-3">
      <Button disabled={disabled || item.errors.length > 0} onClick={() => onSave(item, choices)}>
        {saveLabel(count, item, t)}
      </Button>
      <Button variant="outline" disabled={disabled} onClick={onNext}>
        {t('review.next')}
      </Button>
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

import { useTranslation } from 'react-i18next';

import { Button, Textarea } from '@pops/ui';

import { contactGateway } from '../entity/api';
import { ContactPicker } from '../entity/ContactPicker';
import { describeContactError } from '../errors';
import { duplicateMergeGateway } from './api';
import { SourceEvidence } from './SourceEvidence';
import { useDuplicateReview } from './useDuplicateReview';

import type { TFunction } from 'i18next';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactGateway } from '../entity/api';
import type { DuplicateMergeGateway, DuplicateSourceSnapshot } from './api';
import type { DuplicateReview } from './useDuplicateReview';

/** Review available provenance before explicitly merging two selected contacts. */
export function DuplicateMergePanel({
  gateway = duplicateMergeGateway,
  searchGateway = contactGateway,
}: {
  gateway?: DuplicateMergeGateway;
  searchGateway?: ContactGateway;
}) {
  const { t } = useTranslation('contacts');
  const review = useDuplicateReview(gateway, t('errors.saveFailed'));
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 text-sm md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold leading-tight tracking-normal">
          {t('duplicates.title')}
        </h1>
        <p className="text-muted-foreground">{t('duplicates.description')}</p>
      </header>
      {review.error && <p role="alert">{describeContactError(review.error, t)}</p>}
      {review.saved && <p role="status">{t('duplicates.saved')}</p>}
      <section className="grid gap-4 md:grid-cols-2">
        <MergeContactCard
          kind="source"
          entity={review.source}
          snapshot={review.sourceQuery.data}
          loading={review.sourceQuery.isLoading}
          onChoose={() => review.setSourcePicker(true)}
        />
        <MergeContactCard
          kind="canonical"
          entity={review.canonical}
          snapshot={review.canonicalQuery.data}
          loading={review.canonicalQuery.isLoading}
          onChoose={() => review.setCanonicalPicker(true)}
        />
      </section>
      <MergeDecisionForm
        source={review.source}
        canonical={review.canonical}
        evidence={review.evidence}
        preview={review.preview}
        canPreview={review.canPreview}
        saving={review.saving}
        saved={review.saved}
        onEvidenceChange={review.changeEvidence}
        onPreview={() => review.setPreview(true)}
        onCancel={() => review.setPreview(false)}
        onApply={() => void review.apply()}
        t={t}
      />
      <MergePickers review={review} searchGateway={searchGateway} />
    </main>
  );
}

function MergeContactCard({
  kind,
  entity,
  snapshot,
  loading,
  onChoose,
}: {
  kind: 'source' | 'canonical';
  entity: Entity | null;
  snapshot?: DuplicateSourceSnapshot;
  loading: boolean;
  onChoose: () => void;
}) {
  const { t } = useTranslation('contacts');
  const label = kind === 'source' ? t('duplicates.source') : t('duplicates.keep');
  const button = kind === 'source' ? t('duplicates.chooseSource') : t('duplicates.chooseKeep');
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold leading-tight tracking-normal">{label}</h2>
      {entity && <p className="font-medium">{entity.name}</p>}
      <Button variant="outline" className="min-h-11" onClick={onChoose}>
        {button}
      </Button>
      {snapshot && <SourceEvidence snapshot={snapshot} />}
      {loading && <p role="status">{t('duplicates.loading')}</p>}
    </section>
  );
}

function MergeDecisionForm({
  source,
  canonical,
  evidence,
  preview,
  canPreview,
  saving,
  saved,
  onEvidenceChange,
  onPreview,
  onCancel,
  onApply,
  t,
}: {
  source: Entity | null;
  canonical: Entity | null;
  evidence: string;
  preview: boolean;
  canPreview: boolean;
  saving: boolean;
  saved: boolean;
  onEvidenceChange: (value: string) => void;
  onPreview: () => void;
  onCancel: () => void;
  onApply: () => void;
  t: TFunction<'contacts'>;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <Textarea
        aria-label={t('duplicates.reason')}
        className="min-h-24 text-sm"
        value={evidence}
        disabled={saving || saved}
        onChange={(event) => onEvidenceChange(event.target.value)}
      />
      {preview ? (
        <div className="space-y-3" role="group" aria-label={t('duplicates.confirmation')}>
          <p>{t('duplicates.confirm', { source: source?.name, canonical: canonical?.name })}</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" disabled={saving} onClick={onApply}>
              {t('duplicates.apply')}
            </Button>
            <Button variant="outline" className="min-h-11" disabled={saving} onClick={onCancel}>
              {t('duplicates.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="min-h-11" disabled={!canPreview} onClick={onPreview}>
          {t('duplicates.preview')}
        </Button>
      )}
    </section>
  );
}

function MergePickers({
  review,
  searchGateway,
}: {
  review: DuplicateReview;
  searchGateway: ContactGateway;
}) {
  return (
    <>
      <ContactPicker
        open={review.sourcePicker}
        onOpenChange={review.setSourcePicker}
        onSelect={review.chooseSource}
        allowCreate={false}
        gateway={searchGateway}
      />
      <ContactPicker
        open={review.canonicalPicker}
        onOpenChange={review.setCanonicalPicker}
        onSelect={review.chooseCanonical}
        allowCreate={false}
        gateway={searchGateway}
      />
    </>
  );
}

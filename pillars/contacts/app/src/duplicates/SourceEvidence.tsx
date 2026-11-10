import { useTranslation } from 'react-i18next';

import type { DuplicateSourceSnapshot } from './api';

/** Display source records and method ownership for an explicit merge review. */
export function SourceEvidence({ snapshot }: { snapshot: DuplicateSourceSnapshot }) {
  const { t } = useTranslation('contacts');
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <SourceRecords snapshot={snapshot} />
      <h3 className="text-sm font-medium">{t('duplicates.methods')}</h3>
      {snapshot.points.length === 0 && (
        <p className="text-muted-foreground">{t('person.noMethods')}</p>
      )}
      <ul className="space-y-1">
        {snapshot.points.map((point) => (
          <ContactPointEvidence key={point.id} point={point} snapshot={snapshot} />
        ))}
      </ul>
    </div>
  );
}

function SourceRecords({ snapshot }: { snapshot: DuplicateSourceSnapshot }) {
  const { t } = useTranslation('contacts');
  let emptyMessage: string | null = null;
  if (snapshot.entity.type !== 'person') emptyMessage = t('duplicates.sourcesLimited');
  else if (snapshot.sources.length === 0) emptyMessage = t('duplicates.noSources');
  return (
    <>
      <h3 className="text-sm font-medium">{t('duplicates.sources')}</h3>
      {emptyMessage && <p className="text-muted-foreground">{emptyMessage}</p>}
      <ul className="space-y-2">
        {snapshot.sources.map((source) => (
          <li key={source.id} className="rounded-md bg-muted/40 p-3">
            <p className="font-medium">
              {snapshot.accounts.find((account) => account.id === source.accountId)?.label ??
                snapshot.accounts.find((account) => account.id === source.accountId)?.provider ??
                source.accountId}
            </p>
            <p className="text-xs text-muted-foreground">
              {source.collectionKey} ·{' '}
              {source.active ? t('duplicates.active') : t('person.inactive')}
            </p>
            <p className="break-words">{source.displayName ?? snapshot.entity.name}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function ContactPointEvidence({
  point,
  snapshot,
}: {
  point: DuplicateSourceSnapshot['points'][number];
  snapshot: DuplicateSourceSnapshot;
}) {
  const { t } = useTranslation('contacts');
  const source = snapshot.sources.find((item) => item.id === point.sourceRecordId);
  const account = snapshot.accounts.find((item) => item.id === source?.accountId);
  return (
    <li className="min-w-0 break-words">
      <span className="text-xs text-muted-foreground">
        {account?.label ?? t('person.local')} ·{' '}
      </span>
      {point.value}
    </li>
  );
}

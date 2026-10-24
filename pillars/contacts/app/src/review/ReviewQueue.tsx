import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { ReviewSnapshot } from './contracts';

interface QueueProps {
  snapshot: ReviewSnapshot;
  selectedId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onPage: (offset: number) => void;
}

/** Render a server-classified row page without changing classifications or stable identities. */
export function ReviewQueue({ snapshot, selectedId, disabled, onSelect, onPage }: QueueProps) {
  const { t } = useTranslation('contacts');
  return (
    <nav aria-label={t('queue.label')} className="grid grid-cols-2 gap-2 lg:block lg:space-y-2">
      {snapshot.items.map((entry) => (
        <Button
          key={entry.id}
          disabled={disabled}
          variant={entry.id === selectedId ? 'secondary' : 'ghost'}
          className="h-auto min-h-11 min-w-0 w-full justify-start whitespace-normal py-3 text-left"
          aria-current={entry.id === selectedId ? 'true' : undefined}
          onClick={() => onSelect(entry.id)}
        >
          <span className="min-w-0 break-words text-base font-semibold">
            {entry.name || t('unnamedContact')}
            <span className="mt-1 block text-sm font-normal text-foreground/85">
              {t(entry.status, { defaultValue: entry.status })}
            </span>
          </span>
        </Button>
      ))}
      <div className="col-span-2 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={disabled || snapshot.offset === 0}
          onClick={() => onPage(Math.max(0, snapshot.offset - snapshot.limit))}
        >
          {t('queue.previous')}
        </Button>
        <span className="text-sm">
          {Math.floor(snapshot.offset / snapshot.limit) + 1} /{' '}
          {Math.ceil(snapshot.totalRows / snapshot.limit)}
        </span>
        <Button
          variant="outline"
          disabled={disabled || snapshot.offset + snapshot.limit >= snapshot.totalRows}
          onClick={() => onPage(snapshot.offset + snapshot.limit)}
        >
          {t('queue.next')}
        </Button>
      </div>
    </nav>
  );
}

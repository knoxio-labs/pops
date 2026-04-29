import { useTranslation } from 'react-i18next';

import { Skeleton } from '@pops/ui';

export function SettingsLoading() {
  return (
    <div className="flex h-full min-h-0">
      {/* Left rail skeleton */}
      <div className="w-60 shrink-0 hidden md:flex flex-col border-r border-border/50">
        <div className="p-4 border-b border-border/50">
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="p-2 space-y-1">
          {['s1', 's2', 's3', 's4', 's5'].map((id) => (
            <Skeleton key={id} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </div>
      {/* Right pane skeleton */}
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

export function SettingsEmpty() {
  const { t } = useTranslation('shell');

  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      {t('noSettingsRegistered')}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { CalendarDays, CircleCheck, Eye } from 'lucide-react';

import { Button, DateInput, formatDate } from '@pops/ui';

import { useMarkAsWatched } from './mark-as-watched/useMarkAsWatched';

export interface MarkAsWatchedButtonProps {
  mediaId: number;
  className?: string;
}

function CustomDateRow({
  customDate,
  setCustomDate,
  onLog,
  loading,
}: {
  customDate: string;
  setCustomDate: (v: string) => void;
  onLog: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <DateInput
        size="sm"
        value={customDate}
        onChange={(e) => {
          setCustomDate(e.target.value);
        }}
        max={new Date().toISOString().split('T')[0]}
        aria-label={t('markAsWatched.watchDate')}
      />
      <Button
        variant="default"
        size="sm"
        onClick={onLog}
        disabled={!customDate}
        loading={loading}
        loadingText={t('markAsWatched.logging')}
      >
        Log
      </Button>
    </div>
  );
}

export function MarkAsWatchedButton({ mediaId, className }: MarkAsWatchedButtonProps) {
  const { t } = useTranslation('media');
  const {
    showDatePicker,
    setShowDatePicker,
    customDate,
    setCustomDate,
    watchCount,
    lastWatched,
    logMutation,
    handleMarkWatched,
    handleMarkWatchedWithDate,
  } = useMarkAsWatched(mediaId);

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkWatched}
          loading={logMutation.isPending && !showDatePicker}
          loadingText={t('markAsWatched.logging')}
          prefix={
            watchCount > 0 ? <CircleCheck className="h-4 w-4" /> : <Eye className="h-4 w-4" />
          }
          aria-label={t('markAsWatched.markAsWatched')}
        >
          {watchCount > 0 ? `Watched (${watchCount})` : 'Mark as Watched'}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setShowDatePicker(!showDatePicker);
          }}
          aria-label={t('markAsWatched.pickCustomWatchDate')}
        >
          <CalendarDays className="h-4 w-4" />
        </Button>
      </div>

      {showDatePicker && (
        <CustomDateRow
          customDate={customDate}
          setCustomDate={setCustomDate}
          onLog={handleMarkWatchedWithDate}
          loading={logMutation.isPending && showDatePicker}
        />
      )}

      {watchCount > 0 && lastWatched && (
        <p className="text-xs text-muted-foreground mt-1">Last watched {formatDate(lastWatched)}</p>
      )}
    </div>
  );
}

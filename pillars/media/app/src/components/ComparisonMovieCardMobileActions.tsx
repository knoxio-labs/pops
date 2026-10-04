import { MoreHorizontal } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { CardActionsOverlay, type CardActionProps } from './ComparisonMovieCardActions';

/** Provides tap access to a movie card's actions on narrow screens. */
export function MobileCardActions({
  movie,
  onNA,
  naPending,
  onMarkStale,
  stalePending,
  onBlacklist,
  blacklistPending,
}: CardActionProps) {
  if (!(onNA ?? onMarkStale ?? onBlacklist)) return undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-11 gap-1 rounded-full px-2 sm:hidden"
          aria-label={`Actions for ${movie.title}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span>Actions</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 sm:hidden">
        <p className="px-3 py-2 text-sm font-medium">{movie.title} actions</p>
        <CardActionsOverlay
          movie={movie}
          onNA={onNA}
          naPending={naPending}
          onMarkStale={onMarkStale}
          stalePending={stalePending}
          onBlacklist={onBlacklist}
          blacklistPending={blacklistPending}
          mobile
        />
      </PopoverContent>
    </Popover>
  );
}

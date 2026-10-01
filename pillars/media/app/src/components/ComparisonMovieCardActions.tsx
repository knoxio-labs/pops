import { Ban, Bookmark, Clock, EyeOff } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

import type { ComparisonMovieCardMovie, ComparisonMovieCardProps } from './ComparisonMovieCard';

/** Props shared by the desktop action overlay and narrow-screen action popover. */
export type CardActionProps = Pick<
  ComparisonMovieCardProps,
  'onNA' | 'naPending' | 'onMarkStale' | 'stalePending' | 'onBlacklist' | 'blacklistPending'
> & { movie: ComparisonMovieCardMovie };

export function WatchlistButton({
  movie,
  onToggle,
  isOnWatchlist,
  pending,
}: {
  movie: ComparisonMovieCardMovie;
  onToggle: () => void;
  isOnWatchlist?: boolean;
  pending?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          disabled={pending}
          className={`relative flex min-h-11 w-16 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 backdrop-blur-sm transition-colors before:absolute before:-inset-2 before:content-[''] sm:min-h-0 sm:w-auto sm:flex-row sm:p-1.5 ${
            isOnWatchlist
              ? 'bg-app-accent/90 text-app-accent-foreground hover:bg-destructive/90 hover:text-destructive-foreground'
              : 'bg-overlay-scrim/50 text-on-media/80 hover:text-on-media hover:bg-overlay-scrim/70'
          }`}
          aria-label={
            isOnWatchlist
              ? `Remove ${movie.title} from watchlist`
              : `Add ${movie.title} to watchlist`
          }
          data-testid={`watchlist-button-${movie.id}`}
        >
          <Bookmark className={`h-4 w-4 ${isOnWatchlist ? 'fill-current' : ''}`} />
          <span className="max-w-20 text-center text-xs leading-tight sm:hidden">
            {isOnWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isOnWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      </TooltipContent>
    </Tooltip>
  );
}

export function ScoreDeltaBadge({ movieId, scoreDelta }: { movieId: number; scoreDelta: number }) {
  return (
    <div
      className={`px-2 py-1 rounded-full text-xs font-bold tabular-nums animate-bounce ${
        scoreDelta > 0
          ? 'bg-success/90 text-success-foreground'
          : 'bg-destructive/90 text-destructive-foreground'
      }`}
      data-testid={`score-delta-${movieId}`}
    >
      {scoreDelta > 0 ? '+' : ''}
      {scoreDelta}
    </div>
  );
}

function ActionIconButton({
  icon: Icon,
  onClick,
  disabled,
  ariaLabel,
  testId,
  tooltip,
  hoverDestructive,
  mobile = false,
}: {
  icon: typeof Ban;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  testId: string;
  tooltip: string;
  hoverDestructive?: boolean;
  mobile?: boolean;
}) {
  const hoverColor = hoverDestructive ? 'hover:text-destructive/80' : 'hover:text-on-media';
  const mobileColor = hoverDestructive
    ? 'text-destructive hover:bg-destructive/10'
    : 'text-foreground hover:bg-accent';
  const button = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={
        mobile
          ? `flex min-h-11 w-full items-center justify-start gap-3 rounded-md px-3 py-2 text-left ${mobileColor}`
          : `relative rounded-full bg-overlay-scrim/40 p-2 text-on-media/80 ${hoverColor} hover:bg-overlay-scrim/60 backdrop-blur-sm transition-colors before:absolute before:-inset-1.5 before:content-['']`
      }
      aria-label={mobile ? tooltip : ariaLabel}
      data-testid={mobile ? undefined : testId}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {mobile && <span className="text-sm">{tooltip}</span>}
    </button>
  );

  if (mobile) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function CardActionsOverlay({
  movie,
  onNA,
  naPending,
  onMarkStale,
  stalePending,
  onBlacklist,
  blacklistPending,
  mobile = false,
}: CardActionProps & { mobile?: boolean }) {
  if (!(onNA ?? onMarkStale ?? onBlacklist)) return undefined;
  return (
    <div className={mobile ? 'flex flex-col gap-1' : 'flex justify-center gap-2'}>
      {onNA && (
        <ActionIconButton
          icon={Ban}
          onClick={onNA}
          disabled={naPending}
          ariaLabel={`N/A: ${movie.title}`}
          testId={`na-button-${movie.id}`}
          tooltip="N/A — exclude from this dimension"
          mobile={mobile}
        />
      )}
      {onMarkStale && (
        <ActionIconButton
          icon={Clock}
          onClick={onMarkStale}
          disabled={stalePending}
          ariaLabel={`Mark ${movie.title} as stale`}
          testId={`stale-button-${movie.id}`}
          tooltip="Stale — reduce score weight"
          mobile={mobile}
        />
      )}
      {onBlacklist && (
        <ActionIconButton
          icon={EyeOff}
          onClick={onBlacklist}
          disabled={blacklistPending}
          ariaLabel={`Not watched ${movie.title}`}
          testId={`blacklist-button-${movie.id}`}
          tooltip="Not watched"
          mobile={mobile}
          hoverDestructive
        />
      )}
    </div>
  );
}

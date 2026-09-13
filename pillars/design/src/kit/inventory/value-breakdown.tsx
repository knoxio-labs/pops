import { AlertCircle, MapPin, RefreshCw, Tag } from 'lucide-react';

/**
 * Value breakdown cards: replacement value grouped by item type or location.
 */
import { Alert, AlertDescription, Button, Card, CardContent, Skeleton } from '@pops/ui';

import { BreakdownChart, type BreakdownEntry } from './value-breakdown-chart';

export interface ValueBreakdownCardProps {
  data: BreakdownEntry[];
  isLoading?: boolean;
  isError?: boolean;
  /**
   * The pillar answered "unavailable", which in the app is an
   * `isUnavailableError` on the query and makes the card render nothing at
   * all. A prop here because the canvas has no query to fail.
   */
  isUnavailable?: boolean;
  /** Retries the fetch that populated `data`; defaults to a no-op for the canvas, which has none to retry. */
  onRetry?: () => void;
  /**
   * The app navigates to the filtered item list on click; the canvas renders
   * inside an iframe, so navigation would leave the surface. Defaults to a
   * no-op and hands the clicked entry to the caller instead.
   */
  onBarClick?: (entry: BreakdownEntry) => void;
  className?: string;
}

export function ValueByTypeCard({
  data,
  isLoading = false,
  isError = false,
  isUnavailable = false,
  onRetry = () => {},
  onBarClick = () => {},
  className,
}: ValueBreakdownCardProps) {
  if (isUnavailable) return null;
  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <Tag className="h-4 w-4" />
          <span className="text-xs font-medium">Value by Type</span>
        </div>
        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>Failed to load type breakdown</span>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <BreakdownChart data={data} onBarClick={onBarClick} />
        )}
      </CardContent>
    </Card>
  );
}

export function ValueByLocationCard({
  data,
  isLoading = false,
  isError = false,
  isUnavailable = false,
  onRetry = () => {},
  onBarClick = () => {},
  className,
}: ValueBreakdownCardProps) {
  if (isUnavailable) return null;
  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <MapPin className="h-4 w-4" />
          <span className="text-xs font-medium">Value by Location</span>
        </div>
        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>Failed to load location breakdown</span>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <BreakdownChart data={data} onBarClick={onBarClick} />
        )}
      </CardContent>
    </Card>
  );
}

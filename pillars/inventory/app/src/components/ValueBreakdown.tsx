import { useQuery } from '@tanstack/react-query';
import { AlertCircle, MapPin, RefreshCw, Tag } from 'lucide-react';
import { useNavigate } from 'react-router';

/**
 * Value breakdown cards — replacement value grouped by item type or location.
 */
import { Alert, AlertDescription, Button, Card, CardContent, Skeleton } from '@pops/ui';

import { isUnavailableError, unwrap } from '../inventory-api-helpers.js';
import { reportsValueByLocation, reportsValueByType } from '../inventory-api/index.js';
import { BreakdownChart, type BreakdownEntry } from './ValueBreakdown.chart';

export function ValueByTypeCard({ className }: { className?: string }) {
  const navigate = useNavigate();

  const {
    data: typeData,
    isLoading: typeLoading,
    isError: typeError,
    error: typeErr,
    refetch: refetchType,
  } = useQuery({
    queryKey: ['inventory', 'reports', 'valueByType'],
    queryFn: async () => unwrap(await reportsValueByType()),
  });

  if (isUnavailableError(typeErr)) return null;
  if (typeLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const typeEntries: BreakdownEntry[] = typeData?.data ?? [];

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <Tag className="h-4 w-4" />
          <span className="text-xs font-medium">Value by Type</span>
        </div>
        {typeError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>Failed to load type breakdown</span>
              <Button variant="outline" size="sm" onClick={() => refetchType()}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <BreakdownChart
            data={typeEntries}
            onBarClick={(entry) => navigate(`/inventory?type=${encodeURIComponent(entry.name)}`)}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function ValueByLocationCard({ className }: { className?: string }) {
  const navigate = useNavigate();

  const {
    data: locationData,
    isLoading: locationLoading,
    isError: locationError,
    error: locationErr,
    refetch: refetchLocation,
  } = useQuery({
    queryKey: ['inventory', 'reports', 'valueByLocation'],
    queryFn: async () => unwrap(await reportsValueByLocation()),
  });

  if (isUnavailableError(locationErr)) return null;
  if (locationLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const locationEntries: BreakdownEntry[] = locationData?.data ?? [];

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <MapPin className="h-4 w-4" />
          <span className="text-xs font-medium">Value by Location</span>
        </div>
        {locationError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>Failed to load location breakdown</span>
              <Button variant="outline" size="sm" onClick={() => refetchLocation()}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <BreakdownChart
            data={locationEntries}
            onBarClick={(entry) => {
              if (entry.key) {
                void navigate(`/inventory?locationId=${encodeURIComponent(entry.key)}`);
              }
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

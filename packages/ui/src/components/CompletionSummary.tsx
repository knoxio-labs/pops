import { ArrowRight, CheckCircle, Clock, Trophy, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../primitives/card';
import { Button } from './Button';

export interface CompletionSummaryDimension {
  dimensionId: number;
  name: string;
  status: 'complete' | 'pending';
  comparisonId: number | null;
}

export interface CompletionSummaryData {
  sessionId: number;
  movieTitle: string;
  dimensions: CompletionSummaryDimension[];
}

export interface CompletionSummaryProps {
  data: CompletionSummaryData;
  onDoAnother?: () => void;
  onDone: () => void;
  className?: string;
}

function DimensionBadge({ dim }: { dim: CompletionSummaryDimension }) {
  const { t } = useTranslation('ui');
  if (dim.status === 'complete' && dim.comparisonId !== null) {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle className="h-3 w-3" />
        {t('completionSummary.compared')}
      </Badge>
    );
  }
  if (dim.status === 'complete' && dim.comparisonId === null) {
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="h-3 w-3" />
        {t('completionSummary.skipped')}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="h-3 w-3" />
      {t('completionSummary.pending')}
    </Badge>
  );
}

/**
 * Post-session debrief summary: per-dimension outcome badges and exit actions.
 */
export function CompletionSummary({
  data,
  onDoAnother,
  onDone,
  className,
}: CompletionSummaryProps) {
  const { t } = useTranslation('ui');
  const completed = data.dimensions.filter(
    (d) => d.status === 'complete' && d.comparisonId !== null
  );
  const skipped = data.dimensions.filter((d) => d.status === 'complete' && d.comparisonId === null);

  return (
    <Card data-testid="completion-summary" className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-warning" />
          <CardTitle className="text-lg">{t('completionSummary.debriefComplete')}</CardTitle>
        </div>
        <p className="text-muted-foreground text-sm">
          {t('completionSummary.finishedDebrief')} <strong>{data.movieTitle}</strong>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {data.dimensions.map((dim) => (
            <div key={dim.dimensionId} className="flex items-center justify-between text-sm">
              <span>{dim.name}</span>
              <DimensionBadge dim={dim} />
            </div>
          ))}
        </div>

        <div className="text-muted-foreground border-t pt-3 text-sm">
          {t('completionSummary.comparedCount', {
            count: completed.length,
            skippedCount: skipped.length,
          })}
        </div>

        <div className="flex gap-2 pt-1">
          {onDoAnother && (
            <Button variant="outline" size="sm" onClick={onDoAnother}>
              <ArrowRight className="mr-1 h-4 w-4" />
              {t('completionSummary.doAnother')}
            </Button>
          )}
          <Button variant="default" size="sm" onClick={onDone} data-testid="done-btn">
            {t('completionSummary.done')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

CompletionSummary.displayName = 'CompletionSummary';

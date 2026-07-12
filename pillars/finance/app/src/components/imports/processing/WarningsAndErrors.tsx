import { RefreshCw } from 'lucide-react';

import { Button } from '@pops/ui';

import { ImportWarningBanner } from '../ImportWarningBanner';

import type { ImportWarning } from '@pops/finance';

export function WarningCard({ warning }: { warning: ImportWarning }) {
  return (
    <ImportWarningBanner
      warning={warning}
      affectedHint=". You can manually categorize them in the review step."
      className="w-full max-w-md"
    />
  );
}

interface ErrorPanelProps {
  errorMessage?: string;
  errors?: Array<{ error: string }>;
  onRetry: () => void;
}

export function FatalErrorPanel({ errorMessage, errors, onRetry }: ErrorPanelProps) {
  return (
    <div className="p-4 max-w-md w-full text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-lg">
      <p className="font-medium mb-1">Processing Failed</p>
      <p>{errorMessage ?? 'An unexpected error occurred'}</p>
      {errors && errors.length > 0 && (
        <div className="mt-2 space-y-1">
          {errors.map((error) => (
            <p key={error.error} className="text-xs">
              • {error.error}
            </p>
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 text-destructive hover:text-destructive"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

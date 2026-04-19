import { CheckCircle, Loader2, XCircle } from 'lucide-react';

import { cn } from '../lib/utils';

export interface ProgressItem {
  description: string;
  status: 'processing' | 'success' | 'failed';
}

export interface ProgressStep {
  label: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface LoadingProgressStepProps {
  /** Title shown below the spinner */
  title: string;
  /** Subtitle / message */
  message?: string;
  /** 0–100 progress percentage. Omit to hide the bar. */
  progress?: number;
  /** Named pipeline steps */
  steps?: ProgressStep[];
  /** Currently processing items (shows a mini-list) */
  currentBatch?: ProgressItem[];
  /** Error messages to show in warning blocks */
  errors?: string[];
  /** When true, show a checkmark instead of spinner */
  done?: boolean;
  className?: string;
}

/**
 * Centered loading UI for long-running async steps in a wizard flow.
 */
export function LoadingProgressStep({
  title,
  message,
  progress,
  steps,
  currentBatch,
  errors,
  done = false,
  className,
}: LoadingProgressStepProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 space-y-6', className)}>
      {done ? (
        <CheckCircle className="w-16 h-16 text-success" />
      ) : (
        <Loader2 className="w-16 h-16 animate-spin text-info" />
      )}

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">{title}</h2>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>

      {progress !== undefined && (
        <div className="w-full max-w-md">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-info/50 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {steps && steps.length > 0 && (
        <div className="w-full max-w-md text-xs text-muted-foreground space-y-1">
          {steps.map((step) => (
            <div key={step.label} className="flex justify-between">
              <span>{step.label}</span>
              <span>
                {step.status === 'in_progress'
                  ? 'In progress...'
                  : step.status === 'done'
                    ? 'Complete'
                    : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}

      {currentBatch && currentBatch.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-xs font-medium text-foreground mb-2">Currently processing:</p>
          <div className="space-y-1">
            {currentBatch.map((item, idx) => (
              <div
                key={`${idx}-${item.description}`}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {item.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                {item.status === 'success' && <CheckCircle className="w-3 h-3 text-success" />}
                {item.status === 'failed' && <XCircle className="w-3 h-3 text-destructive" />}
                <span className="truncate">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {errors && errors.length > 0 && (
        <div className="w-full max-w-md space-y-2">
          {errors.map((error) => (
            <div
              key={error}
              className="p-3 text-sm text-warning bg-warning/10 rounded-lg border border-warning/25"
            >
              <p className="text-xs">{error}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

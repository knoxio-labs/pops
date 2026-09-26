import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../primitives/alert';
import { Button } from './Button';

import type { ApiErrorPresentation } from '../primitives/sonner';

export interface ErrorAlertProps {
  title: string;
  message: string;
  /** Optional technical details rendered in a collapsible code block */
  details?: string;
  className?: string;
}

/**
 * Standardised destructive alert for API/load errors across all pages.
 */
export function ErrorAlert({ title, message, details, className }: ErrorAlertProps) {
  const { t } = useTranslation('ui');
  return (
    <Alert variant="destructive" className={className}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="mb-2">{message}</p>
        {details && (
          <details className="mt-3">
            <summary className="cursor-pointer hover:underline font-medium text-sm">
              {t('errorAlert.showDetails')}
            </summary>
            <code className="block mt-2 p-3 bg-muted rounded text-xs font-mono whitespace-pre-wrap break-all">
              {details}
            </code>
          </details>
        )}
      </AlertDescription>
    </Alert>
  );
}

export interface ErrorStateProps {
  /** API failure whose safe message and stable code should be displayed. */
  readonly error: ApiErrorPresentation;
  /** Optional retry action for recoverable views. */
  readonly onRetry?: () => void;
  readonly className?: string;
}

/** Shared in-page API failure state with retry and collapsible request details. */
export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const { t } = useTranslation('errors');
  const message = t(error.code, { defaultValue: error.message });

  return (
    <section
      role="alert"
      className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}
    >
      <TriangleAlert className="size-10 text-destructive" aria-hidden />
      <h2 className="text-lg font-semibold text-foreground">{message}</h2>
      <code
        aria-label={t('web.error.code', { defaultValue: 'Error code' })}
        className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
      >
        {error.code}
      </code>
      {error.requestId ? (
        <details className="text-sm text-muted-foreground">
          <summary className="min-h-11 cursor-pointer content-center font-medium hover:underline">
            {t('web.error.showDetails', { defaultValue: 'Show details' })}
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-left">
            <dt>{t('web.error.requestId', { defaultValue: 'Request ID' })}</dt>
            <dd className="break-all font-mono text-xs">{error.requestId}</dd>
          </dl>
        </details>
      ) : null}
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          {t('web.error.retry', { defaultValue: 'Try again' })}
        </Button>
      ) : null}
    </section>
  );
}

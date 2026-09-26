import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { createElement } from 'react';
import { getI18n } from 'react-i18next';
import { toast, Toaster as Sonner, type ToasterProps } from 'sonner';

/** The browser-safe API error fields used by shared error presentation. */
export interface ApiErrorPresentation {
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly retryable: boolean;
}

/** Diagnostic context appended to the copied support block. */
export interface ToastErrorContext {
  readonly build?: string;
  readonly id?: string;
  readonly operation?: string;
  readonly time?: Date;
}

function translatedErrorMessage(error: ApiErrorPresentation): string {
  const i18n = getI18n();
  return i18n?.t(error.code, { defaultValue: error.message, ns: 'errors' }) ?? error.message;
}

function translatedLabel(key: string, fallback: string): string {
  const i18n = getI18n();
  return i18n?.t(key, { defaultValue: fallback, ns: 'errors' }) ?? fallback;
}

/**
 * Formats the stable support block copied from an API-error toast.
 * Missing request, operation, and build values are reported explicitly.
 */
export function formatErrorDetails(
  error: ApiErrorPresentation,
  context: ToastErrorContext = {}
): string {
  const unavailable = translatedLabel('web.error.notAvailable', 'Not available');
  return [
    `Code: ${error.code}`,
    `Message: ${error.message}`,
    `Request ID: ${error.requestId ?? unavailable}`,
    `Operation: ${context.operation ?? unavailable}`,
    `Time: ${(context.time ?? new Date()).toISOString()}`,
    `Build: ${context.build ?? unavailable}`,
  ].join('\n');
}

/** Shows an API failure with its stable code and a copyable diagnostic block. */
export function toastError(error: ApiErrorPresentation, context: ToastErrorContext = {}): void {
  const message = translatedErrorMessage(error);
  const codeLabel = translatedLabel('web.error.code', 'Error code');
  const copyLabel = translatedLabel('web.error.copyDetails', 'Copy details');

  toast.error(message, {
    id: context.id,
    description: createElement(
      'code',
      {
        'aria-label': codeLabel,
        className:
          'inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground',
      },
      error.code
    ),
    action: {
      label: copyLabel,
      onClick: () => {
        const clipboard = globalThis.navigator?.clipboard;
        if (clipboard === undefined) return;
        void clipboard.writeText(formatErrorDetails(error, context)).catch(() => undefined);
      },
    },
  });
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };

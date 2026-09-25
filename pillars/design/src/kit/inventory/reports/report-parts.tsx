import { HintTooltip } from '@/kit/inventory/foundation';
/**
 * Report building blocks: a figure tile, a share bar, a titled panel, and
 * the Paperless receipt control, which stays visible but disabled with its
 * reason when Paperless cannot be reached (owner decision 7).
 */
import { FileText, TriangleAlert } from 'lucide-react';

import { ButtonPrimitive, Skeleton, cn } from '@pops/ui';

import type { ReactNode } from 'react';

/** One headline figure. `tone` warning marks a figure that asks for action. */
export function StatTile({
  label,
  value,
  detail,
  tone = 'neutral',
  loading = false,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'warning';
  loading?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="text-2xs font-medium tracking-label text-muted-foreground uppercase">
        {label}
      </span>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-24" />
      ) : (
        <span className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
          {value}
          {tone === 'warning' ? (
            <TriangleAlert className="size-4 text-warning" aria-label="Needs a look" />
          ) : null}
        </span>
      )}
      {detail && !loading ? (
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      ) : null}
    </>
  );
  const shell =
    'flex min-w-0 flex-col items-start gap-0.5 rounded-lg border bg-card px-4 py-3 text-left';
  if (onClick === undefined) return <div className={shell}>{body}</div>;
  return (
    <ButtonPrimitive
      variant="ghost"
      onClick={onClick}
      className={cn(shell, 'h-auto font-normal hover:bg-muted/60')}
    >
      {body}
    </ButtonPrimitive>
  );
}

/** A horizontal bar for a 0 to 1 share. */
export function ShareBar({ share, className }: { share: number; className?: string }) {
  const percent = Math.max(0, Math.min(1, share)) * 100;
  return (
    <span
      className={cn('block h-1.5 overflow-hidden rounded-full bg-muted', className)}
      aria-hidden
    >
      <span className="block h-full rounded-full bg-app-accent" style={{ width: `${percent}%` }} />
    </span>
  );
}

/** A titled panel whose body scrolls. */
export function ReportPanel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card', className)}
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {aside}
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

/** Why receipts cannot open while Paperless is unreachable. */
export const PAPERLESS_DOWN_REASON = 'Paperless unreachable, documents unavailable.';

/** The Paperless receipt for a row: opens the document, or says why it cannot. */
export function ReceiptLink({
  receiptId,
  paperlessDown,
}: {
  receiptId: number | null;
  paperlessDown: boolean;
}) {
  if (receiptId === null) return <span className="text-xs text-muted-foreground">No receipt</span>;
  return (
    <HintTooltip
      label={`Open receipt ${receiptId} in Paperless`}
      disabledReason={paperlessDown ? PAPERLESS_DOWN_REASON : undefined}
    >
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        aria-disabled={paperlessDown || undefined}
        onClick={paperlessDown ? undefined : () => {}}
        className={cn('gap-1 px-1 text-xs font-normal', paperlessDown && 'opacity-50')}
      >
        <FileText className="size-3.5" aria-hidden />#{receiptId}
      </ButtonPrimitive>
    </HintTooltip>
  );
}

/**
 * The one line the documents section shows when Paperless cannot serve it
 * (POPS-50, owner decision 7): the section stays, its actions go dim, and
 * this says why and where it gets fixed.
 */
import { CloudOff, Settings } from 'lucide-react';

import { cn } from '@pops/ui';

/** Why Paperless is not serving documents. */
export type PaperlessOutage = 'unreachable' | 'not-configured';

const COPY: Readonly<Record<PaperlessOutage, string>> = {
  unreachable: 'Paperless is unreachable. Documents cannot be opened or linked until it is back.',
  'not-configured':
    'Paperless is not connected. Connect it in Inventory settings to link documents.',
};

/** The reason actions are off, for their tooltips. */
export function paperlessReason(outage: PaperlessOutage): string {
  return outage === 'unreachable' ? 'Paperless is unreachable.' : 'Paperless is not connected.';
}

/** The notice line. */
export function PaperlessNotice({
  outage,
  className,
}: {
  outage: PaperlessOutage;
  className?: string;
}) {
  const Icon = outage === 'unreachable' ? CloudOff : Settings;
  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground',
        className
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{COPY[outage]}</span>
    </p>
  );
}

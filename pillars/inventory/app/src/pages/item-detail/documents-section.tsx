import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';

import { Skeleton } from '@pops/ui';

import { unwrap } from '../../inventory-api-helpers.js';
import { paperlessStatus } from '../../inventory-api/index.js';
import { DocumentsList } from './documents-list';

import type { PaperlessState } from '../../foundation/item-page';

function paperlessReason(state: PaperlessState): string | undefined {
  if (state === 'connected') return undefined;
  if (state === 'unreachable') {
    return 'Paperless-ngx is unavailable. Actions are disabled until it is reachable.';
  }
  return 'Paperless-ngx is not connected. Actions are disabled until it is configured.';
}

/** Renders Paperless state, linked documents, and disabled outage actions. */
export function DocumentsSection({ itemId, readOnly }: { itemId: string; readOnly: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'paperless', 'status'],
    queryFn: async () => unwrap(await paperlessStatus()),
  });
  const status = data?.data;
  if (!isLoading && !status?.configured) return null;
  if (isLoading) {
    return (
      <section aria-label="Documents" className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4" aria-hidden />
          Documents
        </h2>
        <Skeleton className="h-11 w-full" />
      </section>
    );
  }

  const paperless: PaperlessState = status?.available ? 'connected' : 'unreachable';
  const disabledReason = paperlessReason(paperless);
  return (
    <section aria-label="Documents" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="size-4" aria-hidden />
        Documents
      </h2>
      {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
      <DocumentsList
        itemId={itemId}
        baseUrl={status?.baseUrl ?? null}
        disabledReason={disabledReason}
        readOnly={readOnly}
      />
    </section>
  );
}

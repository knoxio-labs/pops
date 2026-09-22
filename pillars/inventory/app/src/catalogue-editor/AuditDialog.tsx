import { useQuery } from '@tanstack/react-query';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pops/ui';

import { unwrap } from '../inventory-api-helpers';
import { typesReadAudit } from '../inventory-api/index.js';
import { AuditEvents } from './AuditEvents';

interface AuditDialogProps {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

/** Displays immutable publication and abandonment history for the catalogue. */
export function AuditDialog({ onOpenChange, open }: AuditDialogProps) {
  const query = useQuery({
    queryKey: ['inventory', 'type-catalogue', 'audit'],
    queryFn: async () => unwrap(await typesReadAudit({ query: { limit: 100 } })),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Catalogue audit history</DialogTitle>
          <DialogDescription>
            Publication and abandonment events are immutable and newest first.
          </DialogDescription>
        </DialogHeader>
        <AuditEvents error={query.error} events={query.data?.events} loading={query.isLoading} />
      </DialogContent>
    </Dialog>
  );
}

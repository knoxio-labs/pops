import { type ImportSourceKind } from '@/fixtures/import-sources';
import { FileText, Table2, Zap } from 'lucide-react';

import { Badge } from '@pops/ui';

const KIND_META: Record<ImportSourceKind, { label: string; icon: typeof Zap }> = {
  'csv-dialect': { label: 'CSV', icon: Table2 },
  'pdf-statement': { label: 'Statement', icon: FileText },
  api: { label: 'Synced', icon: Zap },
};

export function importKindLabel(kind: ImportSourceKind): string {
  return KIND_META[kind].label;
}

/**
 * The shape of the thing that fed a batch, beside the format that named it:
 * a CSV that was mapped, a statement that was read, a provider that was
 * fetched. Same weight as the checkpoint source badge it sits near, because
 * they answer the same question about different rows.
 */
export function ImportSourceBadge({ kind, format }: { kind: ImportSourceKind; format?: string }) {
  const { label, icon: Icon } = KIND_META[kind];
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <Icon className="h-3 w-3" />
      {format ? `${format} · ${label}` : label}
    </Badge>
  );
}

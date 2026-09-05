import { type CheckpointSource } from '@/fixtures/checkpoints';
import { FileText, Pencil, Upload } from 'lucide-react';

import { Badge } from '@pops/ui';

const SOURCE_META: Record<CheckpointSource, { label: string; icon: typeof Pencil }> = {
  manual: { label: 'Manual', icon: Pencil },
  import: { label: 'Import', icon: Upload },
  statement: { label: 'Statement', icon: FileText },
};

/**
 * Where a checkpoint's number came from. The distinction matters for trust,
 * not decoration: a manual entry can be wrong in a way a parsed statement
 * cannot, which is also why only manual checkpoints are ever deletable.
 */
export function CheckpointSourceBadge({ source }: { source: CheckpointSource }) {
  const { label, icon: Icon } = SOURCE_META[source];
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

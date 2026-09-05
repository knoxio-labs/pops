import { Badge } from '../primitives/badge';
import { CHECKPOINT_SOURCE_META, type CheckpointSource } from './account-shared/checkpoint-source';

/**
 * Where a checkpoint's number came from. The distinction matters for trust,
 * not decoration: a manual entry can be wrong in a way a parsed statement
 * cannot, which is also why only manual checkpoints are ever deletable
 * (ADR-051).
 */
export function CheckpointSourceBadge({ source }: { source: CheckpointSource }) {
  const { label, icon: Icon } = CHECKPOINT_SOURCE_META[source];
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

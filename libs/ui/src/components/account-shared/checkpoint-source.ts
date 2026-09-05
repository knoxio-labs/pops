import { FileText, Pencil, Upload } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

/** Who supplied a checkpoint's number (ADR-051): typed by hand, read off an import, or parsed from a statement. */
export type CheckpointSource = 'manual' | 'import' | 'statement';

/**
 * Label and icon per {@link CheckpointSource}, mirroring `account-kinds.ts`'s
 * split from the finance pillar's own enum. `Pencil`, not `PenLine` — this
 * library's icon for a hand-entered value.
 */
export const CHECKPOINT_SOURCE_META: Record<CheckpointSource, { label: string; icon: LucideIcon }> =
  {
    manual: { label: 'Manual', icon: Pencil },
    import: { label: 'Import', icon: Upload },
    statement: { label: 'Statement', icon: FileText },
  };

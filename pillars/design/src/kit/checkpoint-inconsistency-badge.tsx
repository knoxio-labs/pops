import { type Account } from '@/fixtures/accounts';
import { inconsistentCheckpoint } from '@/fixtures/checkpoints';
import { TriangleAlert } from 'lucide-react';

import { Badge } from '@pops/ui';

/**
 * The one place an inconsistency is announced next to the number itself.
 * Destructive regardless of the account's own tone — a liability already
 * reads red when it owes money, so this has to differ in shape (an icon and
 * a claim), not colour, or it would vanish against the balance it is warning
 * about.
 */
export function CheckpointInconsistencyBadge({ account }: { account: Account }) {
  if (!inconsistentCheckpoint(account.id)) return null;
  return (
    <Badge variant="destructive" className="gap-1 font-normal">
      <TriangleAlert className="h-3 w-3" />
      Disagrees with a checkpoint
    </Badge>
  );
}

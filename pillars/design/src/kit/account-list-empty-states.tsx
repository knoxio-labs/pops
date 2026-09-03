import { Landmark, Plus, SearchX } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

/** There are no accounts at all — the first thing a fresh install has to fix. */
export function NoAccountsYet() {
  return (
    <EmptyState
      icon={Landmark}
      title="No accounts yet"
      description="Add the accounts you bank with. Every imported transaction is filed against one, so this comes before the first import."
      action={<Button prefix={<Plus className="h-4 w-4" />}>Add your first account</Button>}
    />
  );
}

/** There are accounts, but the search and kind filter matched none of them. */
export function NoMatchingAccounts({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No accounts match"
      description="Nothing here matches the search and kinds you have selected. Archived accounts stay hidden until you reveal them."
      action={
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}

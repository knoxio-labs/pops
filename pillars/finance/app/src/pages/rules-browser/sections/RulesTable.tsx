import { BookOpen } from 'lucide-react';

import { DataTable, EmptyState } from '@pops/ui';

import { buildRulesColumns } from '../columns';
import { PAGE_SIZE } from '../useRulesBrowserModel';

import type { Correction } from '../types';

type RulesTableProps = {
  corrections: Correction[];
  onAutoDelete: (id: string) => void;
  onDeleteClick: (id: string) => void;
  onEditClick: (rule: Correction) => void;
};

export function RulesTable({
  corrections,
  onAutoDelete,
  onDeleteClick,
  onEditClick,
}: RulesTableProps) {
  if (corrections.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No categorisation rules found."
        description="Use the Add Rule button to author one manually, or let AI categorisation create one for you."
      />
    );
  }

  const columns = buildRulesColumns({ onAutoDelete, onDeleteClick, onEditClick });
  return <DataTable columns={columns} data={corrections} paginated defaultPageSize={PAGE_SIZE} />;
}

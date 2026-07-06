import { Tag } from 'lucide-react';

import { DataTable, EmptyState } from '@pops/ui';

import { buildTagRulesColumns } from '../columns';
import { PAGE_SIZE } from '../useTagRulesBrowserModel';

import type { TagRule } from '../types';

type TagRulesTableProps = {
  tagRules: TagRule[];
  entityNames: Map<string, string>;
  onEditClick: (rule: TagRule) => void;
  onDisableClick: (id: string) => void;
  onDeleteClick: (id: string) => void;
  isDisablePending: (id: string) => boolean;
};

export function TagRulesTable({
  tagRules,
  entityNames,
  onEditClick,
  onDisableClick,
  onDeleteClick,
  isDisablePending,
}: TagRulesTableProps) {
  if (tagRules.length === 0) {
    return (
      <EmptyState
        icon={Tag}
        title="No tag rules found."
        description="Tag rules are created from the import wizard's tag review step; once saved, manage them here."
      />
    );
  }

  const columns = buildTagRulesColumns({
    entityNames,
    onEditClick,
    onDisableClick,
    onDeleteClick,
    isDisablePending,
  });
  return <DataTable columns={columns} data={tagRules} paginated defaultPageSize={PAGE_SIZE} />;
}

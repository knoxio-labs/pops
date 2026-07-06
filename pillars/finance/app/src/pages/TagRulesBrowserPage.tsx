import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { TagRuleEditDialog } from './tag-rules-browser/edit-form/TagRuleEditDialog';
import { useTagRuleEditForm } from './tag-rules-browser/edit-form/useTagRuleEditForm';
import { DeleteTagRuleDialog } from './tag-rules-browser/sections/DeleteTagRuleDialog';
import { TagRulesErrorState } from './tag-rules-browser/sections/TagRulesErrorState';
import { TagRulesFilters } from './tag-rules-browser/sections/TagRulesFilters';
import { TagRulesLoadingState } from './tag-rules-browser/sections/TagRulesLoadingState';
import { TagRulesPagination } from './tag-rules-browser/sections/TagRulesPagination';
import { TagRulesTable } from './tag-rules-browser/sections/TagRulesTable';
import { PAGE_SIZE, useTagRulesBrowserModel } from './tag-rules-browser/useTagRulesBrowserModel';

/**
 * Browse, filter, edit, disable, and delete tag-suggestion rules — the
 * `transaction_tag_rules` management surface (#3659 / CP007). Rules are
 * created via the import wizard's tag review step (`TagRuleProposalDialog`);
 * this page is where an already-created rule gets fixed, pruned, or turned
 * off without direct REST calls.
 */
type Model = ReturnType<typeof useTagRulesBrowserModel>;

function FiltersSection({ model }: { model: Model }) {
  return (
    <TagRulesFilters
      matchType={model.matchType}
      isActive={model.isActive}
      minConfidence={model.minConfidence}
      onMatchTypeChange={(value) => {
        model.setMatchType(value);
        model.resetPage();
      }}
      onIsActiveChange={(value) => {
        model.setIsActive(value);
        model.resetPage();
      }}
      onMinConfidenceChange={(value) => {
        model.setMinConfidence(value);
        model.resetPage();
      }}
      onClear={() => {
        model.setMatchType('');
        model.setIsActive('');
        model.setMinConfidence('');
        model.resetPage();
      }}
    />
  );
}

function PaginationSection({ model }: { model: Model }) {
  if (!model.pagination) return null;
  return (
    <TagRulesPagination
      total={model.pagination.total}
      offset={model.offset}
      currentPage={model.currentPage}
      totalPages={model.totalPages}
      onPrevious={() => model.setOffset(Math.max(0, model.offset - PAGE_SIZE))}
      onNext={() => model.setOffset(model.offset + PAGE_SIZE)}
    />
  );
}

function TagRulesBrowserBody({ model }: { model: Model }) {
  const { t } = useTranslation('finance');
  const editForm = useTagRuleEditForm({ rule: model.editingRule, onClose: model.closeEditDialog });

  return (
    <div className="space-y-6">
      <PageHeader title={t('tagRules.title')} description={t('tagRules.description')} />

      <FiltersSection model={model} />

      <TagRulesTable
        tagRules={model.tagRules}
        entityNames={model.entityNames}
        onEditClick={model.handleEditRule}
        onDisableClick={model.handleDisable}
        onDeleteClick={model.setDeleteId}
        onApplyExistingClick={model.handleApplyExisting}
        isDisablePending={(id) =>
          model.disableMutation.isPending && model.disableMutation.variables === id
        }
        isApplyExistingPending={(id) =>
          model.applyExistingMutation.isPending && model.applyExistingMutation.variables === id
        }
      />

      <PaginationSection model={model} />

      <DeleteTagRuleDialog
        open={!!model.deleteId}
        onOpenChange={(open) => {
          if (!open) model.setDeleteId(null);
        }}
        onConfirm={model.handleDelete}
        isPending={model.deleteMutation.isPending}
      />

      <TagRuleEditDialog
        rule={model.editingRule}
        onOpenChange={(open) => {
          if (!open) model.closeEditDialog();
        }}
        form={editForm.form}
        isSubmitting={editForm.isSubmitting}
        onSubmit={editForm.onSubmit}
        entities={editForm.entities}
      />
    </div>
  );
}

export function TagRulesBrowserPage(): React.ReactElement {
  const model = useTagRulesBrowserModel();

  if (model.isLoading) return <TagRulesLoadingState />;
  if (model.isError) return <TagRulesErrorState onRetry={() => model.refetch()} />;
  return <TagRulesBrowserBody model={model} />;
}

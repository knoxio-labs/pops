/**
 * TagRuleEditDialog — edit surface for an existing tag rule (view/edit/
 * disable/delete browser, #3659). `descriptionPattern` and `matchType` are
 * shown read-only — the backend treats them as the rule's immutable
 * identity (see `UpdateTransactionTagRuleInput`) — while entity scope, tags,
 * confidence, priority, and the active flag are editable. A side panel shows
 * the usage telemetry and a full-DB match-history preview.
 */
import { Loader2 } from 'lucide-react';
import { type UseFormReturn } from 'react-hook-form';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type EntityOption,
} from '@pops/ui';

import {
  ActiveField,
  ConfidenceField,
  EntityField,
  PatternContext,
  PriorityField,
  TagsField,
} from './TagRuleEditFields';
import { TagRuleUsagePreviewPanel } from './TagRuleUsagePreviewPanel';
import { type TagRuleEditFormValues } from './types';
import { useTagRuleUsagePreview } from './useTagRuleUsagePreview';

import type { TagRule } from '../types';

interface TagRuleEditDialogProps {
  rule: TagRule | null;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<TagRuleEditFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: TagRuleEditFormValues) => void;
  entities: EntityOption[];
}

function EditFields({
  rule,
  form,
  entities,
}: {
  rule: TagRule;
  form: UseFormReturn<TagRuleEditFormValues>;
  entities: EntityOption[];
}) {
  return (
    <div className="grid gap-4 min-w-0">
      <PatternContext rule={rule} />
      <div className="grid grid-cols-2 gap-4">
        <EntityField form={form} entities={entities} />
        <PriorityField form={form} />
      </div>
      <TagsField form={form} />
      <ConfidenceField form={form} />
      <ActiveField form={form} />
    </div>
  );
}

function DialogActions({
  isSubmitting,
  onCancel,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save
      </Button>
    </DialogFooter>
  );
}

export function TagRuleEditDialog(props: TagRuleEditDialogProps) {
  const { rule, onOpenChange, form, isSubmitting, onSubmit, entities } = props;
  const usagePreview = useTagRuleUsagePreview({
    ruleId: rule?.id ?? null,
    pattern: rule?.descriptionPattern ?? '',
    matchType: rule?.matchType ?? 'exact',
    enabled: rule !== null,
  });

  return (
    <Dialog open={rule !== null} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-4xl">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Tag Rule</DialogTitle>
            <DialogDescription className="sr-only">
              Edit the entity scope, tags, confidence, priority, and active flag for this tag rule
            </DialogDescription>
          </DialogHeader>
          {rule && (
            <div className="grid gap-6 py-4 md:grid-cols-2">
              <EditFields rule={rule} form={form} entities={entities} />
              <TagRuleUsagePreviewPanel rule={rule} preview={usagePreview} />
            </div>
          )}
          <DialogActions isSubmitting={isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

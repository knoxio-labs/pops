/**
 * RuleFormDialog — manual create/edit surface for AI categorisation rules.
 *
 * Closes #2187 and unblocks the e2e flows in #2119 / #2135. The dialog
 * mirrors `EntityFormDialog`'s shape (Controller for ChipInput / boolean
 * toggle, register for TextInput) and adds a side preview pane showing the
 * transactions the candidate (pattern, matchType) would match against the
 * live transactions table.
 */
import { Loader2 } from 'lucide-react';
import { type UseFormReturn } from 'react-hook-form';

import {
  type AccountOption,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type EntityOption,
} from '@pops/ui';

import { PatternAndType, TagsAndActive } from './RuleFormFields';
import { RulePreviewPanel, type RulePreviewPanelProps } from './RulePreviewPanel';
import { type RuleFormValues } from './types';

import type { Correction } from '../types';

interface RuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule: Correction | null;
  form: UseFormReturn<RuleFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: RuleFormValues) => void;
  preview: RulePreviewPanelProps['preview'];
  entities: EntityOption[];
  accounts: AccountOption[];
}

function DialogActions({
  editingRule,
  isSubmitting,
  onCancel,
}: {
  editingRule: Correction | null;
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
        {editingRule ? 'Update' : 'Create'}
      </Button>
    </DialogFooter>
  );
}

export function RuleFormDialog(props: RuleFormDialogProps) {
  const {
    open,
    onOpenChange,
    editingRule,
    form,
    isSubmitting,
    onSubmit,
    preview,
    entities,
    accounts,
  } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-4xl">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'New Rule'}</DialogTitle>
            <DialogDescription className="sr-only">
              Define the pattern and settings for this categorisation rule
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4 md:grid-cols-2">
            <div className="grid gap-4 min-w-0">
              <PatternAndType form={form} entities={entities} accounts={accounts} />
              <TagsAndActive form={form} />
            </div>
            <RulePreviewPanel preview={preview} />
          </div>
          <DialogActions
            editingRule={editingRule}
            isSubmitting={isSubmitting}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

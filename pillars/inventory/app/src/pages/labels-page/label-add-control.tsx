import { Plus } from 'lucide-react';

import { Button } from '@pops/ui';

import { AddDialog } from './add-dialog';

import type { ComponentProps } from 'react';

type Props = Pick<
  ComponentProps<typeof AddDialog>,
  'open' | 'onOpenChange' | 'selectedIds' | 'onAdd'
>;

/** Opens the label selection picker from the job's Add button. */
export function LabelAddControl(props: Props) {
  return (
    <AddDialog
      {...props}
      trigger={
        <Button size="sm" variant="outline" prefix={<Plus className="size-4" aria-hidden />}>
          Add
        </Button>
      }
    />
  );
}

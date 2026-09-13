/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/sections/FormFooter.tsx`.
 *
 * The source's Cancel button is a `react-router` `Link` back to
 * `/inventory`; the canvas is an iframe with nowhere for a real navigation
 * to land, so it becomes a callback prop defaulting to a no-op.
 */
import { Save } from 'lucide-react';

import { Button } from '@pops/ui';

export interface FormFooterProps {
  isEditMode: boolean;
  isMutating: boolean;
  onCancel?: () => void;
}

export function FormFooter({ isEditMode, isMutating, onCancel = () => {} }: FormFooterProps) {
  return (
    <div className="flex gap-4 pt-6 border-t">
      <Button
        type="submit"
        size="lg"
        className="flex-1 bg-app-accent hover:bg-app-accent/80 text-app-accent-foreground font-bold transition-all shadow-md shadow-app-accent/20"
        loading={isMutating}
        loadingText={isEditMode ? 'Saving...' : 'Creating...'}
      >
        <Save className="h-5 w-5 mr-2" />
        {isEditMode ? 'Save Changes' : 'Create Item'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="px-8 font-bold border-app-accent/20 hover:bg-app-accent/5"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

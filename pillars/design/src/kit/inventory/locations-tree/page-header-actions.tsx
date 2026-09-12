import { FileText, Plus } from 'lucide-react';

import { Button } from '@pops/ui';

interface PageHeaderActionsProps {
  onAddRoot: () => void;
  /** In place of the app's `<Link to="/inventory/reports/insurance">`: the canvas is an iframe, so a real navigation would leave the surface. */
  onInsuranceReport: () => void;
}

export function PageHeaderActions({ onAddRoot, onInsuranceReport }: PageHeaderActionsProps) {
  return (
    <>
      <button
        type="button"
        onClick={onInsuranceReport}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <FileText className="h-4 w-4" />
        Insurance Report
      </button>
      <Button
        variant="ghost"
        size="sm"
        className="text-app-accent hover:text-app-accent/80"
        prefix={<Plus className="h-4 w-4" />}
        onClick={onAddRoot}
      >
        Add Root Location
      </Button>
    </>
  );
}

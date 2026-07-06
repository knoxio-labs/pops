import { Alert, Button, PageHeader } from '@pops/ui';

type TagRulesErrorStateProps = {
  onRetry: () => void;
};

export function TagRulesErrorState({ onRetry }: TagRulesErrorStateProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="Tag Rules" description="Browse and manage tag-suggestion rules" />
      <Alert variant="destructive">
        <h3 className="font-semibold">Failed to load tag rules</h3>
        <p className="text-sm mt-1">Something went wrong loading tag rules.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      </Alert>
    </div>
  );
}

import { Alert, AlertDescription, AlertTitle, Skeleton } from '@pops/ui';

export function ItemDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}

export function ItemDetailErrorState({ variant }: { variant: 'not-found' | 'error' }) {
  const is404 = variant === 'not-found';
  return (
    <div>
      <Alert variant="destructive">
        <AlertTitle>{is404 ? 'Item not found' : 'Error'}</AlertTitle>
        <AlertDescription>
          {is404 ? "This item doesn't exist." : 'The inventory pillar did not answer in time.'}
        </AlertDescription>
      </Alert>
      <a
        href="/inventory"
        className="mt-4 inline-block text-sm text-app-accent hover:text-app-accent/80 underline font-medium"
        onClick={(e) => e.preventDefault()}
      >
        Back to inventory
      </a>
    </div>
  );
}

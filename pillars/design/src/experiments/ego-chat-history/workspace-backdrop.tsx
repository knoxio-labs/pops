import { Card } from '@pops/ui';

/** Provides a fictional workspace backdrop behind the compact chat preview. */
export function WorkspaceBackdrop() {
  return (
    <div className="hidden min-h-svh md:block">
      <header className="flex h-14 items-center border-b bg-background px-6 text-sm font-semibold">
        POPS <span className="ml-3 font-normal text-muted-foreground">Workspace</span>
      </header>
      <div className="mx-auto max-w-4xl space-y-5 p-8">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Today</p>
          <h1 className="text-2xl font-semibold">Your workspace</h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="h-32 bg-background p-5">
            <p className="text-sm font-medium">Today</p>
            <p className="mt-2 text-sm text-muted-foreground">Three things on your list</p>
          </Card>
          <Card className="h-32 bg-background p-5">
            <p className="text-sm font-medium">Recently saved</p>
            <p className="mt-2 text-sm text-muted-foreground">Notes and useful links</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

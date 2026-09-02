import { Menu, Search } from 'lucide-react';

/**
 * The shell's top bar, as chrome the reviewed screen sits under: wordmark,
 * search, actions. Nothing here does anything — it is here to take up the
 * height and attention it takes up in the product, at the same breakpoints.
 */
export function TopBar() {
  return (
    <header className="fixed top-0 z-40 flex h-14 w-full items-center border-b border-border bg-card px-3 md:h-16 md:px-4">
      <div className="flex min-w-0 flex-1 items-center">
        <span
          className="mr-2 inline-flex size-11 items-center justify-center rounded-lg text-foreground/70 md:hidden"
          aria-hidden
        >
          <Menu className="size-5" />
        </span>
        <h1 className="bg-gradient-to-br from-brand-gradient-from via-brand-gradient-via to-brand-gradient-to bg-clip-text text-xl font-black tracking-tighter text-transparent md:text-2xl">
          POPS
        </h1>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <div className="hidden w-full max-w-80 items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground md:flex">
          <Search className="size-4 shrink-0" aria-hidden />
          <span>Search</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="hidden text-xs text-muted-foreground lg:inline">you@pops.local</span>
        <span className="size-8 rounded-full bg-muted" aria-hidden />
      </div>
    </header>
  );
}

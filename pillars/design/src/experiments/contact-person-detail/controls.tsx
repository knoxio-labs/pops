import { Plus, Trash2 } from 'lucide-react';

import { Button, TextInput } from '@pops/ui';

import type { ReactNode } from 'react';

/** Commit individual source fields on blur so one undo restores one edit. */
export function Field({
  label,
  value,
  update,
  type = 'text',
  prominent = false,
}: {
  label: string;
  value: string;
  update: (value: string) => void;
  type?: string;
  prominent?: boolean;
}) {
  return (
    <TextInput
      key={value}
      aria-label={label}
      label={type === 'date' ? label : undefined}
      className={prominent ? 'text-xl font-semibold md:text-xl' : undefined}
      variant="ghost"
      containerClassName="min-w-0 flex-1 bg-transparent"
      type={type}
      defaultValue={value}
      placeholder={label}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) update(event.currentTarget.value);
      }}
    />
  );
}
/** Shared repeatable section with explicit add and remove operations. */
export function Section({
  title,
  icon,
  add,
  children,
}: {
  title: string;
  icon: ReactNode;
  add?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-foreground/25 bg-muted/60 shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-foreground/25 px-3 py-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="text-app-accent">{icon}</span>
          {title}
        </h2>
        {add && (
          <Button variant="outline" onClick={add}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        )}
      </header>
      <div className="space-y-1 p-2">{children}</div>
    </section>
  );
}
/** Accessible removal preserves the row description. */
export function Remove({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      aria-label={`Remove ${name}`}
      onClick={onClick}
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}

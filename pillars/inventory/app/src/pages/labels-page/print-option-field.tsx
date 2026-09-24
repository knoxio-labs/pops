import type { ReactNode } from 'react';

/** One captioned choice in the options row above the preview. */
export function OptionField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const caption = 'text-xs font-medium text-muted-foreground';
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={caption}>
          {label}
        </label>
      ) : (
        <span className={caption} aria-hidden>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

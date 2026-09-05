/**
 * Shared visible label for form controls that associate via `htmlFor`/`id`.
 * Renders nothing when no label text is supplied.
 */
export function FieldLabel({ htmlFor, label }: { htmlFor: string; label?: string }) {
  if (!label) return null;
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1"
    >
      {label}
    </label>
  );
}

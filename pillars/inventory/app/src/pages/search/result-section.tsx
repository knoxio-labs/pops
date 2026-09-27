/** A labelled result section heading that exposes server counts to assistive technology. */
export function ResultSectionHeading({
  title,
  count,
}: {
  readonly title: string;
  readonly count: number;
}) {
  return (
    <h2 className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>{title}</span>
      <span className="tabular-nums">{count}</span>
    </h2>
  );
}

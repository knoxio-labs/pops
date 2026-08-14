/** Priority badge for nudge cards. */
export function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: 'bg-destructive/10 text-destructive',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-info/10 text-info',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[priority] ?? ''}`}>{priority}</span>
  );
}

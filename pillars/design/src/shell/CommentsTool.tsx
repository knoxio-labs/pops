import { MessageSquare } from 'lucide-react';

import { Button, cn } from '@pops/ui';

/**
 * Dock button for comment mode. A plain toggle rather than a popover: the
 * comments themselves live in the frame, so there is nothing for a popover
 * here to hold. The badge is the number of open threads on the surface
 * currently on the canvas, reported up by the frame.
 */
export function CommentsTool({
  active,
  openCount,
  onToggle,
}: {
  active: boolean;
  openCount: number;
  onToggle: () => void;
}) {
  const label = active ? 'Exit comments (i)' : 'Comments (i)';
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      shape="pill"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onToggle}
      className={cn(
        'relative h-11 min-w-11 px-3 shadow-lg backdrop-blur-xl',
        !active && 'bg-card/80'
      )}
    >
      <MessageSquare className="size-4" />
      {openCount > 0 ? (
        <span className="absolute -top-1 -right-1 flex size-4 min-w-4 items-center justify-center rounded-full bg-app-accent px-1 font-mono text-2xs font-bold text-background">
          {openCount}
        </span>
      ) : null}
    </Button>
  );
}

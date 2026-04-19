import { cn } from '../lib/utils';

import type { ReactNode } from 'react';

export interface EmptyStateTabProps {
  message: string;
  /** Optional icon or illustration */
  icon?: ReactNode;
  className?: string;
}

/**
 * Consistent empty-state placeholder for tab panels (review tabs, list views, etc.).
 */
export function EmptyStateTab({ message, icon, className }: EmptyStateTabProps) {
  return (
    <div
      className={cn(
        'text-center py-12 text-gray-500 dark:text-gray-400 flex flex-col items-center gap-3',
        className
      )}
    >
      {icon && <div className="opacity-40">{icon}</div>}
      <p>{message}</p>
    </div>
  );
}

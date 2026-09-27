import { ImageOff } from 'lucide-react';

import { cn } from '../lib/utils';

import type { ReactElement } from 'react';

/** Explains that an image URL could not be loaded. */
export function ImageErrorFallback({ className }: { className?: string }): ReactElement {
  return (
    <div
      className={cn(
        'flex aspect-video w-full flex-col items-center justify-center gap-1 bg-muted px-3 text-center text-muted-foreground',
        className
      )}
    >
      <ImageOff className="size-6" aria-hidden />
      <p className="text-xs font-medium text-foreground">Photo did not load</p>
      <p className="text-2xs">The file is missing or damaged. Replace it or remove it.</p>
    </div>
  );
}

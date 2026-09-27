import { ImageOff } from 'lucide-react';

import { cn } from '../lib/utils';

import type { ImageGalleryItem } from './image-gallery-types';

interface ThumbnailsProps {
  items: ImageGalleryItem[];
  activeIndex: number;
  onPick: (index: number) => void;
  failedIds: ReadonlySet<string>;
  onImageError: (id: string) => void;
}

/** Renders selectable thumbnails and marks images that failed to load. */
export function Thumbnails({
  items,
  activeIndex,
  onPick,
  failedIds,
  onImageError,
}: ThumbnailsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(index)}
          aria-label={`Show image ${index + 1}`}
          aria-current={index === activeIndex}
          className={cn(
            'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-all',
            index === activeIndex
              ? 'border-ring'
              : 'border-transparent opacity-70 hover:opacity-100'
          )}
        >
          {failedIds.has(item.id) ? (
            <span className="flex size-full items-center justify-center" title="Photo did not load">
              <ImageOff className="size-4 text-muted-foreground" aria-hidden />
            </span>
          ) : (
            <img
              src={item.src}
              alt={item.alt ?? ''}
              className="h-full w-full object-cover"
              onError={() => onImageError(item.id)}
            />
          )}
        </button>
      ))}
    </div>
  );
}

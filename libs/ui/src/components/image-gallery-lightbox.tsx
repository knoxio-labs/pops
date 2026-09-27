import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';

import { Button } from '../primitives/button';
import { ImageErrorFallback } from './image-gallery-fallback';

import type { ImageGalleryItem } from './image-gallery-types';

interface LightboxProps {
  active: ImageGalleryItem;
  itemsLength: number;
  onDelete?: (id: string) => void;
  failed: boolean;
  onImageError: (id: string) => void;
  goPrev: () => void;
  goNext: () => void;
  onClose: () => void;
}

function LightboxImage({
  active,
  failed,
  onImageError,
}: Pick<LightboxProps, 'active' | 'failed' | 'onImageError'>) {
  if (failed) return <ImageErrorFallback className="min-h-48 min-w-80" />;

  return (
    <img
      src={active.src}
      alt={active.alt ?? active.caption ?? ''}
      className="max-h-[calc(100vh-6rem)] max-w-full object-contain"
      onError={() => onImageError(active.id)}
    />
  );
}

function LightboxActions({
  activeId,
  onDelete,
  onClose,
}: {
  activeId: string;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-2 top-2 flex gap-1">
      {onDelete ? (
        <Button
          size="icon-sm"
          variant="destructive"
          aria-label="Delete image"
          onClick={() => onDelete(activeId)}
        >
          <Trash2 />
        </Button>
      ) : null}
      <Button size="icon-sm" variant="secondary" aria-label="Close gallery" onClick={onClose}>
        <X />
      </Button>
    </div>
  );
}

function LightboxNavigation({ goPrev, goNext }: Pick<LightboxProps, 'goPrev' | 'goNext'>) {
  return (
    <>
      <Button
        size="icon-sm"
        variant="secondary"
        aria-label="Previous image"
        onClick={goPrev}
        className="absolute left-2 top-1/2 -translate-y-1/2"
      >
        <ChevronLeft />
      </Button>
      <Button
        size="icon-sm"
        variant="secondary"
        aria-label="Next image"
        onClick={goNext}
        className="absolute right-2 top-1/2 -translate-y-1/2"
      >
        <ChevronRight />
      </Button>
    </>
  );
}

/** Renders the gallery lightbox and its image actions. */
export function Lightbox({
  active,
  itemsLength,
  onDelete,
  failed,
  onImageError,
  goPrev,
  goNext,
  onClose,
}: LightboxProps) {
  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim/90 p-4"
      onClick={onClose}
    >
      <div className="relative max-h-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <LightboxImage active={active} failed={failed} onImageError={onImageError} />
        {active.caption ? (
          <div className="mt-2 text-center text-sm text-on-media/80">{active.caption}</div>
        ) : null}
        <LightboxActions activeId={active.id} onDelete={onDelete} onClose={onClose} />
        {itemsLength > 1 ? <LightboxNavigation goPrev={goPrev} goNext={goNext} /> : null}
      </div>
    </div>
  );
}

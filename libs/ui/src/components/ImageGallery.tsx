/**
 * ImageGallery — primary photo + thumbnail strip + lightbox overlay with
 * keyboard navigation. Reusable across any domain with image galleries.
 */
import { useCallback, useEffect, useState } from 'react';

import { cn } from '../lib/utils';
import { ImageErrorFallback } from './image-gallery-fallback';
import { Lightbox } from './image-gallery-lightbox';
import { Thumbnails } from './image-gallery-thumbnails';

import type { ImageGalleryItem, ImageGalleryProps } from './image-gallery-types';

export type { ImageGalleryItem, ImageGalleryProps } from './image-gallery-types';

function useGalleryNav(itemsLength: number) {
  const [activeIndex, setActiveIndex] = useState(0);

  const goPrev = useCallback(
    () => setActiveIndex((i) => (i === 0 ? itemsLength - 1 : i - 1)),
    [itemsLength]
  );
  const goNext = useCallback(
    () => setActiveIndex((i) => (i === itemsLength - 1 ? 0 : i + 1)),
    [itemsLength]
  );

  if (activeIndex >= itemsLength) {
    const clamped = Math.max(0, itemsLength - 1);
    if (clamped !== activeIndex) setActiveIndex(clamped);
  }

  return { activeIndex, setActiveIndex, goPrev, goNext };
}

function useLightboxKeys(
  enabled: boolean,
  goPrev: () => void,
  goNext: () => void,
  onClose: () => void
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, goPrev, goNext, onClose]);
}

interface GalleryContentProps {
  items: ImageGalleryItem[];
  active: ImageGalleryItem;
  activeIndex: number;
  lightboxOpen: boolean;
  onDelete?: (id: string) => void;
  failedIds: ReadonlySet<string>;
  onPick: (index: number) => void;
  onImageError: (id: string) => void;
  onOpenLightbox: () => void;
  goPrev: () => void;
  goNext: () => void;
  onCloseLightbox: () => void;
}

function GalleryMainImage({
  active,
  failed,
  onOpenLightbox,
  onImageError,
}: {
  active: ImageGalleryItem;
  failed: boolean;
  onOpenLightbox: () => void;
  onImageError: (id: string) => void;
}) {
  if (failed) {
    return <ImageErrorFallback className="overflow-hidden rounded-md border border-border" />;
  }

  return (
    <button
      type="button"
      onClick={onOpenLightbox}
      className="group relative overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={active.src}
        alt={active.alt ?? active.caption ?? ''}
        className="aspect-video w-full object-contain transition-transform group-hover:scale-[1.01]"
        onError={() => onImageError(active.id)}
      />
      {active.caption ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-overlay-scrim/70 to-transparent p-3 text-left text-sm text-on-media">
          {active.caption}
        </div>
      ) : null}
    </button>
  );
}

function GalleryContent({
  items,
  active,
  activeIndex,
  lightboxOpen,
  onDelete,
  failedIds,
  onPick,
  onImageError,
  onOpenLightbox,
  goPrev,
  goNext,
  onCloseLightbox,
}: GalleryContentProps) {
  return (
    <div className="flex flex-col gap-3">
      <GalleryMainImage
        active={active}
        failed={failedIds.has(active.id)}
        onOpenLightbox={onOpenLightbox}
        onImageError={onImageError}
      />

      {items.length > 1 ? (
        <Thumbnails
          items={items}
          activeIndex={activeIndex}
          onPick={onPick}
          failedIds={failedIds}
          onImageError={onImageError}
        />
      ) : null}

      {lightboxOpen ? (
        <Lightbox
          active={active}
          itemsLength={items.length}
          onDelete={onDelete}
          failed={failedIds.has(active.id)}
          onImageError={onImageError}
          goPrev={goPrev}
          goNext={goNext}
          onClose={onCloseLightbox}
        />
      ) : null}
    </div>
  );
}

/** Renders a navigable image gallery and explains when an image cannot load. */
export function ImageGallery({
  items,
  onDelete,
  keyboardNav = true,
  className,
}: ImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());
  const { activeIndex, setActiveIndex, goPrev, goNext } = useGalleryNav(items.length);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const markImageFailed = useCallback((id: string) => {
    setFailedIds((current) => {
      if (current.has(id)) return current;
      return new Set([...current, id]);
    });
  }, []);
  useLightboxKeys(lightboxOpen && keyboardNav, goPrev, goNext, closeLightbox);

  const active = items[activeIndex];
  if (items.length === 0 || !active) return null;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <GalleryContent
        items={items}
        active={active}
        activeIndex={activeIndex}
        lightboxOpen={lightboxOpen}
        onDelete={onDelete}
        failedIds={failedIds}
        onPick={setActiveIndex}
        onImageError={markImageFailed}
        onOpenLightbox={() => setLightboxOpen(true)}
        goPrev={goPrev}
        goNext={goNext}
        onCloseLightbox={closeLightbox}
      />
    </div>
  );
}

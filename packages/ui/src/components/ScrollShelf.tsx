/**
 * ScrollShelf + LazyScrollShelf — horizontal "shelf" of items with
 * left/right scroll buttons and an optional IntersectionObserver-based
 * lazy loader for offscreen shelves.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { Button } from '../primitives/button';
import { Skeleton } from '../primitives/skeleton';

export interface ScrollShelfProps<T> {
  title?: ReactNode;
  /** Optional trailing slot (e.g. "See all" link). */
  action?: ReactNode;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string | number;
  /** Item width in pixels, used to compute scroll distance. Default 192. */
  itemWidth?: number;
  className?: string;
}

export function ScrollShelf<T>({
  title,
  action,
  items,
  renderItem,
  getKey,
  itemWidth = 192,
  className,
}: ScrollShelfProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateButtons();
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => updateButtons();
    el.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler);
    return () => {
      el.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [updateButtons, items.length]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = Math.max(itemWidth * 2, Math.round(el.clientWidth * 0.8));
    el.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      )}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => (
            <div key={getKey(item, i)} className="snap-start shrink-0" style={{ width: itemWidth }}>
              {renderItem(item, i)}
            </div>
          ))}
        </div>
        {canScrollLeft ? (
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label="Scroll left"
            onClick={() => scrollBy(-1)}
            className="absolute left-1 top-1/2 -translate-y-1/2 shadow-md"
          >
            <ChevronLeft />
          </Button>
        ) : null}
        {canScrollRight ? (
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label="Scroll right"
            onClick={() => scrollBy(1)}
            className="absolute right-1 top-1/2 -translate-y-1/2 shadow-md"
          >
            <ChevronRight />
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export interface LazyScrollShelfProps<T> extends Omit<ScrollShelfProps<T>, 'items'> {
  /** Loader fired once the shelf becomes visible. */
  loadItems: () => Promise<T[]>;
  /** Skeleton placeholder count. Default 6. */
  placeholderCount?: number;
}

export function LazyScrollShelf<T>({
  loadItems,
  placeholderCount = 6,
  ...rest
}: LazyScrollShelfProps<T>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || items !== null) return;
    let cancelled = false;
    let triggered = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || triggered) continue;
          triggered = true;
          setLoading(true);
          setError(null);
          loadItems()
            .then((data) => {
              if (cancelled) return;
              setItems(data);
              io.disconnect();
            })
            .catch((e: unknown) => {
              if (cancelled) return;
              setError(e instanceof Error ? e.message : 'Failed to load');
              // Allow the observer to retrigger on a subsequent intersect.
              triggered = false;
            })
            .finally(() => {
              if (!cancelled) setLoading(false);
            });
          break;
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [loadItems, items, retryTick]);

  const itemWidth = rest.itemWidth ?? 192;
  const placeholderIds = useMemo(
    () => Array.from({ length: placeholderCount }, (_, i) => `ph-${placeholderCount}-${i}`),
    [placeholderCount]
  );

  return (
    <div ref={wrapperRef}>
      {items === null ? (
        <section className={cn('flex flex-col gap-3', rest.className)}>
          {rest.title ? <h2 className="text-sm font-semibold">{rest.title}</h2> : null}
          {error ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <span>{error}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setRetryTick((t) => t + 1);
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 overflow-hidden">
              {placeholderIds.map((id) => (
                <Skeleton key={id} className="shrink-0 h-48" style={{ width: itemWidth }} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <ScrollShelf {...rest} items={items} />
      )}
      {loading && items === null ? <span className="sr-only">Loading</span> : null}
    </div>
  );
}

/**
 * The item's photos as the page shows them: the lead photo large, the rest
 * as thumbnails beside an Add tile. A file that no longer loads keeps its
 * tile and says so (POPS-3617), never an empty box. No photos is one quiet
 * tile that adds some from disk.
 */
import { ImageOff, ImagePlus } from 'lucide-react';
import { useState } from 'react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { PhotoUploadDialog } from '../photos/photo-upload-dialog';

import type { PhotoItem } from '../photos/photo-item';

/** Props for {@link PhotosSection}. */
export interface PhotosSectionProps {
  photos: readonly PhotoItem[];
  itemName: string;
  /** Forces the lead photo's broken fallback, for review. */
  broken?: boolean;
  /** `tile` sits beside facts; `wide` fills a rail. */
  size?: 'tile' | 'wide';
  disabledReason?: string;
}

function LeadPhoto({ photo, broken }: { photo: PhotoItem; broken: boolean }) {
  const [failed, setFailed] = useState(broken);
  if (failed) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted px-3 text-center text-muted-foreground">
        <ImageOff className="size-6" aria-hidden />
        <p className="text-xs font-medium text-foreground">Photo did not load</p>
        <p className="text-2xs">The file is missing or damaged. Replace it or remove it.</p>
      </div>
    );
  }
  return (
    <img
      src={photo.url}
      alt={photo.caption ?? 'Lead photo'}
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function AddTile({
  onAdd,
  label,
  showLabel = false,
  className,
  disabledReason,
}: {
  onAdd: () => void;
  label: string;
  showLabel?: boolean;
  className?: string;
  disabledReason?: string;
}) {
  return (
    <ButtonPrimitive
      variant="ghost"
      aria-label={label}
      title={disabledReason ?? label}
      aria-disabled={disabledReason !== undefined || undefined}
      onClick={disabledReason === undefined ? onAdd : undefined}
      className={cn(
        'h-auto flex-col gap-1 rounded-lg border border-dashed text-xs font-normal text-muted-foreground',
        disabledReason !== undefined && 'opacity-50',
        className
      )}
    >
      <ImagePlus className="size-4" aria-hidden />
      {showLabel ? label : null}
    </ButtonPrimitive>
  );
}

/** The photos block. */
export function PhotosSection({
  photos,
  itemName,
  broken = false,
  size = 'tile',
  disabledReason,
}: PhotosSectionProps) {
  const [adding, setAdding] = useState(false);
  const [lead, ...rest] = photos;
  const frame = size === 'tile' ? 'aspect-4/3 w-48' : 'aspect-video w-full';
  return (
    <div className={cn('flex shrink-0 flex-col gap-2', size === 'tile' ? 'w-48' : 'w-full')}>
      <div className={cn('overflow-hidden rounded-lg border bg-muted', frame)}>
        {lead ? (
          <LeadPhoto photo={lead} broken={broken} />
        ) : (
          <AddTile
            label="Add photos from disk"
            onAdd={() => setAdding(true)}
            disabledReason={disabledReason}
            showLabel
            className="size-full rounded-none border-0"
          />
        )}
      </div>
      {lead ? (
        <ul aria-label="More photos" className="flex gap-1">
          {rest.slice(0, 3).map((photo) => (
            <li key={photo.id} className="size-11 overflow-hidden rounded-md border bg-muted">
              <img src={photo.url} alt={photo.caption ?? ''} className="size-full object-cover" />
            </li>
          ))}
          <li>
            <AddTile
              label="Add photos"
              onAdd={() => setAdding(true)}
              disabledReason={disabledReason}
              className="size-11 p-0"
            />
          </li>
        </ul>
      ) : null}
      <PhotoUploadDialog open={adding} onOpenChange={setAdding} itemName={itemName} />
    </div>
  );
}

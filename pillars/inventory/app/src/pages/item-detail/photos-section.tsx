import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import type { ReactElement } from 'react';

import type { DetailPhoto } from './detail-model';

/** Props for the read-only photo block in the facts rail. */
export interface PhotosSectionProps {
  itemId: string;
  itemName: string;
  photos: readonly DetailPhoto[];
  disabledReason?: string;
}

function LeadPhoto({ photo, itemName }: { photo: DetailPhoto; itemName: string }): ReactElement {
  const [failed, setFailed] = useState(false);
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
      alt={photo.caption ?? `${itemName} photo`}
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function Thumbnail({ photo }: { photo: DetailPhoto }): ReactElement {
  const [failed, setFailed] = useState(false);
  return (
    <div className="size-11 overflow-hidden rounded-md border bg-muted">
      {failed ? (
        <span className="flex size-full items-center justify-center" title="Photo did not load">
          <ImageOff className="size-4 text-muted-foreground" aria-hidden />
        </span>
      ) : (
        <img
          src={photo.thumbUrl}
          alt={photo.caption ?? ''}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/** Renders the lead photo and up to three read-only thumbnails. */
export function PhotosSection({
  itemId,
  itemName,
  photos,
  disabledReason,
}: PhotosSectionProps): ReactElement {
  const [lead, ...rest] = photos;
  return (
    <section
      aria-label="Photos"
      className="flex w-full shrink-0 flex-col gap-2"
      data-item-id={itemId}
      title={disabledReason}
    >
      <div className="aspect-video w-full overflow-hidden rounded-lg border bg-muted">
        {lead ? (
          <LeadPhoto key={lead.id} photo={lead} itemName={itemName} />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No photos
          </div>
        )}
      </div>
      {lead && rest.length > 0 ? (
        <ul aria-label="More photos" className="flex gap-1">
          {rest.slice(0, 3).map((photo) => (
            <li key={photo.id}>
              <Thumbnail photo={photo} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

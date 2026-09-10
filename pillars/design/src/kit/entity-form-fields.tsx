import { initials } from '@/fixtures/entities';
import { ENTITY_COLORS, entityColorById, type EntityColor } from '@/fixtures/entity-colors';
import { RefreshCw, Upload, X } from 'lucide-react';
import { type ReactNode } from 'react';

import { Avatar, AvatarFallback, AvatarImage, Button, Label } from '@pops/ui';

/** The avatar's live preview inside the form: uploaded image, or initials on the assigned colour. */
export function AvatarPreview({
  avatar,
  colourId,
  name,
}: {
  avatar: string | undefined;
  colourId: string | undefined;
  name: string;
}) {
  const colour = colourId ? entityColorById.get(colourId) : undefined;
  return (
    <Avatar className="size-16 rounded-lg">
      {avatar && <AvatarImage src={avatar} alt="" />}
      <AvatarFallback
        className="rounded-lg text-lg"
        style={colour ? { backgroundColor: colour.tint, color: colour.swatch } : undefined}
      >
        {initials(name || 'New')}
      </AvatarFallback>
    </Avatar>
  );
}

/** A square image field: upload, replace, or remove, used for the avatar. */
export function ImageField({
  label,
  image,
  onChange,
  preview,
}: {
  label: string;
  image: string | undefined;
  onChange: (next: string | undefined) => void;
  preview: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {image ? <img src={image} alt="" className="size-full object-cover" /> : preview}
        </span>
        <UploadControl image={image} onChange={onChange} />
      </div>
    </div>
  );
}

/** A wide banner field, for the poster: same affordance, shaped like the header it feeds. */
export function PosterField({
  image,
  onChange,
}: {
  image: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Poster</Label>
      <div
        className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted bg-cover bg-center"
        style={image ? { backgroundImage: `url("${image}")`, borderStyle: 'solid' } : undefined}
      >
        {!image && <p className="text-xs text-muted-foreground">No poster uploaded</p>}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <UploadControl image={image} onChange={onChange} inline />
        <p className="text-xs text-muted-foreground">Optional. Wide images work best.</p>
      </div>
    </div>
  );
}

function UploadControl({
  image,
  onChange,
  inline = false,
}: {
  image: string | undefined;
  onChange: (next: string | undefined) => void;
  inline?: boolean;
}) {
  return (
    <div className={inline ? 'contents' : 'flex flex-col gap-1.5 text-sm'}>
      <label className="flex w-fit cursor-pointer items-center gap-1.5 text-primary text-sm">
        <Upload className="h-3.5 w-3.5" />
        {image ? 'Replace image' : 'Upload image'}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && onChange(URL.createObjectURL(e.target.files[0]))}
        />
      </label>
      {image && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" /> Remove
        </button>
      )}
      {!image && !inline && <p className="text-xs text-muted-foreground">Optional.</p>}
    </div>
  );
}

/**
 * The colour is never picked from a palette by hand: it's assigned at
 * random when the entity is created, so this field only shows what landed
 * and offers a reroll, rather than a swatch grid.
 */
export function ColourField({
  colourId,
  onShuffle,
}: {
  colourId: string | undefined;
  onShuffle: () => void;
}) {
  const colour = colourId ? entityColorById.get(colourId) : undefined;
  return (
    <div className="space-y-1.5">
      <Label>Colour</Label>
      <div className="flex items-center gap-3">
        {colour ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <span
              className="size-3.5 rounded-full border border-black/10"
              style={{ backgroundColor: colour.swatch }}
            />
            {colour.label}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">None assigned</span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onShuffle}>
          <RefreshCw className="h-3.5 w-3.5" /> Shuffle
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Assigned automatically from a fixed palette; reroll if it clashes.
      </p>
    </div>
  );
}

export function randomOtherColour(currentId: string | undefined): EntityColor {
  const pool = ENTITY_COLORS.filter((c) => c.id !== currentId);
  return pool[Math.floor(Math.random() * pool.length)] ?? ENTITY_COLORS[0];
}

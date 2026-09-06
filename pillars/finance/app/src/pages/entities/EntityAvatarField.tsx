import { RefreshCw } from 'lucide-react';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  FileUpload,
  initials,
  Label,
  type FileValidationError,
} from '@pops/ui';

import { entityAvatarUrlFor, entityColourStyle } from './entity-colour';

import type { Entity } from './types';

const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp';
/** Mirrors `ASSET_MAX_BYTES` in `pillars/contacts/src/entities/routes.rs`. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

function AvatarPreview({ entity }: { entity: Entity }) {
  const colour = entityColourStyle(entity.colour);
  return (
    <Avatar className="size-16 rounded-lg">
      {entity.avatarAssetId && (
        <AvatarImage src={entityAvatarUrlFor(entity.id, entity.avatarAssetId)} alt="" />
      )}
      <AvatarFallback
        className="rounded-lg text-lg"
        style={colour ? { backgroundColor: colour.tint, color: colour.swatch } : undefined}
      >
        {initials(entity.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export interface EntityAvatarFieldProps {
  entity: Entity;
  uploadAvatar: (entityId: string, file: File) => void;
  removeAvatar: (entityId: string) => void;
  uploadIsPending: boolean;
  removeIsPending: boolean;
  onError: (message: string) => void;
}

/**
 * Choose/replace/remove control for an entity's avatar — the entity-scoped
 * mirror of `InstitutionLogoField`. Upload/removal are immediate, not
 * deferred to the dialog's own Save button, since the avatar is a separate
 * resource (`avatar_asset_id`) from the name/type PATCH the form submits.
 * Only rendered once the entity exists (contacts has no way to attach an
 * avatar before an id is minted).
 */
export function EntityAvatarField(props: EntityAvatarFieldProps) {
  const { entity, uploadAvatar, removeAvatar, uploadIsPending, removeIsPending, onError } = props;
  const busy = uploadIsPending || removeIsPending;
  const handleError = (error: FileValidationError) => onError(error.message);

  return (
    <div className="space-y-1.5">
      <Label>Avatar</Label>
      <div className="flex items-start gap-4">
        <AvatarPreview entity={entity} />
        <div className="flex-1 space-y-2">
          <FileUpload
            multiple={false}
            accept={AVATAR_ACCEPT}
            maxSize={AVATAR_MAX_BYTES}
            onFilesSelected={([file]) => file && uploadAvatar(entity.id, file)}
            onError={handleError}
            disabled={busy}
            prompt={entity.avatarAssetId ? 'Replace avatar' : 'Add an avatar'}
            acceptHint="PNG, JPEG or WEBP, up to 2 MB"
          />
          {entity.avatarAssetId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeAvatar(entity.id)}
              disabled={busy}
            >
              Remove avatar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export interface EntityColourFieldProps {
  entity: Entity;
  rerollColour: (entityId: string) => void;
  rerollIsPending: boolean;
}

/**
 * The colour is never picked from a palette by hand — contacts assigns it at
 * random when the entity is created, so this field only shows what landed
 * and offers a reroll (`POST /entities/:id/colour/reroll`), rather than a
 * swatch grid.
 */
export function EntityColourField({
  entity,
  rerollColour,
  rerollIsPending,
}: EntityColourFieldProps) {
  const colour = entityColourStyle(entity.colour);
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
            {colour.swatch}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">None assigned</span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => rerollColour(entity.id)}
          disabled={rerollIsPending}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Shuffle
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Assigned automatically from a fixed palette — reroll if it clashes.
      </p>
    </div>
  );
}

export interface EntityIdentityFieldsProps {
  editingEntity: Entity | null;
  uploadAvatar: (entityId: string, file: File) => void;
  removeAvatar: (entityId: string) => void;
  avatarUploadIsPending: boolean;
  avatarRemoveIsPending: boolean;
  rerollColour: (entityId: string) => void;
  colourRerollIsPending: boolean;
  onAvatarError: (message: string) => void;
}

/**
 * Avatar upload/remove and the colour reroll both need the entity's id, so
 * they only appear once editing an entity that already exists — a brand new
 * entity has nowhere yet to attach either (contacts assigns `colour` and
 * accepts an avatar only after `POST /entities` has minted the id). Poster
 * upload and a dedicated details page are POPS-3067/POPS-3076, out of scope
 * here.
 */
export function EntityIdentityFields({
  editingEntity,
  uploadAvatar,
  removeAvatar,
  avatarUploadIsPending,
  avatarRemoveIsPending,
  rerollColour,
  colourRerollIsPending,
  onAvatarError,
}: EntityIdentityFieldsProps) {
  if (!editingEntity) return null;
  return (
    <>
      <EntityAvatarField
        entity={editingEntity}
        uploadAvatar={uploadAvatar}
        removeAvatar={removeAvatar}
        uploadIsPending={avatarUploadIsPending}
        removeIsPending={avatarRemoveIsPending}
        onError={onAvatarError}
      />
      <EntityColourField
        entity={editingEntity}
        rerollColour={rerollColour}
        rerollIsPending={colourRerollIsPending}
      />
    </>
  );
}

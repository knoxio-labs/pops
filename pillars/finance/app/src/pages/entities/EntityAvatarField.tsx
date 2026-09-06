import { Button, FileUpload, Label, type FileValidationError } from '@pops/ui';

import { entityAvatarUrl } from '../../contacts-api-helpers.js';
import { EntityAvatarMark } from './EntityAvatarMark';
import { type Entity } from './types';

const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp';
/** Mirrors `ASSET_MAX_BYTES` in `pillars/contacts/src/entities/routes.rs`. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export interface EntityAvatarFieldProps {
  entity: Entity;
  uploadAvatar: (file: File) => void;
  removeAvatar: () => void;
  uploadIsPending: boolean;
  removeIsPending: boolean;
  onError: (message: string) => void;
}

/**
 * Upload/replace/remove control for an entity's avatar, shown in
 * `EntityFormDialog` once the entity exists (avatar upload is a dedicated
 * `PUT /entities/{id}/avatar` call, not part of the create/update body, so
 * there is nothing to point it at until the entity has an id). Mirrors
 * `InstitutionLogoField`'s upload/replace/remove affordance.
 */
export function EntityAvatarField(props: EntityAvatarFieldProps) {
  const { entity, uploadAvatar, removeAvatar, uploadIsPending, removeIsPending, onError } = props;
  const avatarUrl = entity.avatarAssetId
    ? entityAvatarUrl(entity.id, entity.avatarAssetId)
    : undefined;
  const busy = uploadIsPending || removeIsPending;

  const handleError = (error: FileValidationError) => onError(error.message);

  return (
    <div className="space-y-1.5">
      <Label>Avatar</Label>
      <div className="flex items-start gap-4">
        <EntityAvatarMark
          name={entity.name}
          avatarUrl={avatarUrl}
          colour={entity.colour}
          size="default"
        />
        <div className="flex-1 space-y-2">
          <FileUpload
            multiple={false}
            accept={AVATAR_ACCEPT}
            maxSize={AVATAR_MAX_BYTES}
            onFilesSelected={([file]) => file && uploadAvatar(file)}
            onError={handleError}
            disabled={busy}
            prompt={avatarUrl ? 'Replace avatar' : 'Add an avatar'}
            acceptHint="PNG, JPEG or WEBP, up to 2 MB"
          />
          {avatarUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={removeAvatar} disabled={busy}>
              Remove avatar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

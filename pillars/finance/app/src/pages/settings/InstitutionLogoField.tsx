import { Button, FileUpload, initials, type FileValidationError } from '@pops/ui';

import { logoUrlFor } from '../../logo-url.js';
import { type Institution } from './types';

const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';
/** Mirrors `LOGO_MAX_BYTES` in `pillars/finance/src/api/modules/logo-upload.ts`. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function LogoPreview({ institution, logoUrl }: { institution: Institution; logoUrl?: string }) {
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border"
      style={{ backgroundColor: logoUrl ? undefined : institution.colour }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="text-sm font-semibold text-white" aria-hidden>
          {initials(institution.name)}
        </span>
      )}
    </div>
  );
}

export interface InstitutionLogoFieldProps {
  institution: Institution;
  uploadLogo: (institutionId: string, file: File) => void;
  removeLogo: (institutionId: string) => void;
  uploadIsPending: boolean;
  removeIsPending: boolean;
  onError: (message: string) => void;
}

/**
 * Choose/replace/remove control for an institution's logo, shown in
 * `InstitutionEditDialog`. Upload/removal are immediate — not deferred to the
 * dialog's own Save button — since the logo is a separate resource
 * (`logo_asset_id`) from the name/colour PATCH the form submits.
 */
export function InstitutionLogoField(props: InstitutionLogoFieldProps) {
  const { institution, uploadLogo, removeLogo, uploadIsPending, removeIsPending, onError } = props;
  const logoUrl = institution.logoAssetId ? logoUrlFor(institution.logoAssetId) : undefined;
  const busy = uploadIsPending || removeIsPending;

  const handleError = (error: FileValidationError) => onError(error.message);

  return (
    <div className="flex items-start gap-4">
      <LogoPreview institution={institution} logoUrl={logoUrl} />
      <div className="flex-1 space-y-2">
        <FileUpload
          multiple={false}
          accept={LOGO_ACCEPT}
          maxSize={LOGO_MAX_BYTES}
          onFilesSelected={([file]) => file && uploadLogo(institution.id, file)}
          onError={handleError}
          disabled={busy}
          prompt={logoUrl ? 'Replace logo' : 'Add a logo'}
          acceptHint="PNG, JPEG or WEBP, up to 2 MB"
        />
        {logoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeLogo(institution.id)}
            disabled={busy}
          >
            Remove logo
          </Button>
        )}
      </div>
    </div>
  );
}

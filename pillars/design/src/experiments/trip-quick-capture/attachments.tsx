import { Paperclip } from 'lucide-react';

import { Button, FileUpload, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

/** Files stay in memory as selected browser File objects; this prototype performs no upload. */
export function CaptureAttachments({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label="Attach files">
          <Paperclip className="size-4" aria-hidden />
          {files.length ? files.length : 'Attach'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <FileUpload
          multiple
          prompt="Choose or drop files"
          acceptHint={null}
          files={files}
          onFilesSelected={(selected) => onChange([...files, ...selected])}
          onRemoveFile={(index) => onChange(files.filter((_, position) => position !== index))}
        />
      </PopoverContent>
    </Popover>
  );
}

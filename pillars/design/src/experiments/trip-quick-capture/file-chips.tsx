import { File, FileAudio, FileCode, FileImage, FileText, FileVideo } from 'lucide-react';

import { Chip, formatBytes } from '@pops/ui';

/** Present a declared MIME type without inferring file content from its name. */
export function filePresentation(type: string) {
  if (type.startsWith('image/')) return { Icon: FileImage, label: 'Image' };
  if (type.startsWith('audio/')) return { Icon: FileAudio, label: 'Audio' };
  if (type.startsWith('video/')) return { Icon: FileVideo, label: 'Video' };
  if (type === 'application/pdf') return { Icon: FileText, label: 'PDF' };
  if (type === 'text/html') return { Icon: FileCode, label: 'HTML' };
  if (type.startsWith('text/')) return { Icon: FileText, label: 'Text' };
  return { Icon: File, label: 'File' };
}

/** Display selected browser files with MIME-based icons; removal targets the exact list occurrence. */
export function CaptureFileChips({
  files,
  onChange,
}: {
  files: File[];
  onChange?: (files: File[]) => void;
}) {
  if (!files.length) return null;
  return (
    <ul aria-label="Attachments" className="flex flex-wrap gap-2">
      {files.map((file, index) => {
        const { Icon, label } = filePresentation(file.type.toLowerCase());
        return (
          <li key={`${file.name}-${file.lastModified}-${index}`} className="min-w-0 max-w-full">
            <Chip
              variant="outline"
              className="min-h-11 max-w-full gap-2 border-foreground/25 bg-background/60 px-3 text-sm"
              title={`${file.name} · ${formatBytes(file.size)}`}
              prefix={<Icon className="size-4 text-app-accent" role="img" aria-label={label} />}
              removable={Boolean(onChange)}
              removeLabel={`Remove attachment ${file.name}`}
              onRemove={() => onChange?.(files.filter((_, position) => position !== index))}
            >
              {file.name}
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}

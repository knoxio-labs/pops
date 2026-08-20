import { FileText, Upload, X } from 'lucide-react';

import { Button, Label } from '@pops/ui';

import { describeAcceptedTypes } from './accepted-types';

export interface DragHandlers {
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

interface DropZoneProps extends DragHandlers {
  hasError: boolean;
  hasFiles: boolean;
  acceptedTypes: string;
  maxSizeMB: number;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function DropZone(props: DropZoneProps) {
  const { isDragging, hasError, hasFiles, acceptedTypes, maxSizeMB } = props;
  const kinds = describeAcceptedTypes(acceptedTypes);
  const borderClass = isDragging ? 'border-info bg-info/5' : 'border-border';
  const errorClass = hasError ? 'border-destructive bg-destructive/5' : '';
  const padding = hasFiles ? 'p-6' : 'p-12';
  return (
    <div
      onDragEnter={props.onDragEnter}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      className={`relative border-2 border-dashed rounded-lg ${padding} transition-colors duration-200 ease-in-out ${borderClass} ${errorClass}`}
    >
      <Label
        htmlFor="file-upload"
        className="flex flex-col items-center justify-center cursor-pointer"
      >
        <Upload
          className={`w-12 h-12 mb-4 ${hasError ? 'text-destructive' : 'text-muted-foreground'}`}
        />
        <span className="text-sm font-medium text-foreground mb-1">
          {hasFiles ? `Add more ${kinds} files` : `Drop ${kinds} files here or click to browse`}
        </span>
        <span className="text-xs text-muted-foreground">
          Maximum file size: {maxSizeMB}MB. Files must share the same columns.
        </span>
        <input
          id="file-upload"
          type="file"
          multiple
          accept={acceptedTypes}
          onChange={props.onFileInput}
          tabIndex={0}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          aria-label={`Upload ${kinds} files`}
        />
      </Label>
    </div>
  );
}

function SelectedFileCard({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 border-2 border-success bg-success/5 rounded-lg">
      <div className="flex items-center gap-3">
        <FileText className="w-8 h-8 text-success" />
        <div>
          <p className="text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${file.name}`}
      >
        <X className="w-5 h-5" />
      </Button>
    </div>
  );
}

function totalSizeKB(files: File[]): string {
  return (files.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(2);
}

function SelectedFileList({ files, onRemove }: { files: File[]; onRemove: (file: File) => void }) {
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <SelectedFileCard
          key={`${file.name}:${file.size}:${file.lastModified}`}
          file={file}
          onRemove={() => onRemove(file)}
        />
      ))}
      {files.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {files.length} files selected · {totalSizeKB(files)} KB total
        </p>
      )}
    </div>
  );
}

export interface FileUploadViewProps extends DragHandlers {
  selectedFiles: File[];
  errors: string[];
  acceptedTypes: string;
  maxSizeMB: number;
  onRemove: (file: File) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function FileUploadView(p: FileUploadViewProps) {
  return (
    <div className="space-y-4">
      {p.selectedFiles.length > 0 && (
        <SelectedFileList files={p.selectedFiles} onRemove={p.onRemove} />
      )}
      <DropZone {...p} hasError={p.errors.length > 0} hasFiles={p.selectedFiles.length > 0} />
      {p.errors.length > 0 && (
        <div className="p-3 space-y-1 text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-md">
          {p.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}

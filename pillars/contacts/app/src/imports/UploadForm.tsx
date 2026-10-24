import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, FileUpload, Select, TextInput } from '@pops/ui';

import type { FileImportInput } from './contracts';

type Options = Omit<FileImportInput, 'file'>;
const initialOptions: Options = {
  format: 'vcard',
  encoding: 'utf8',
  sourceName: '',
  collectionKey: 'contacts',
};

interface UploadProps {
  disabled: boolean;
  onStage: (input: FileImportInput) => void;
}

/** Select an export and its stable source namespace before staging a preview. */
export function UploadForm({ disabled, onStage }: UploadProps) {
  const { t } = useTranslation('contacts');
  const [options, setOptions] = useState<Options>(initialOptions);
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  return (
    <form
      className="space-y-4 rounded-lg border border-border p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (file) onStage({ ...options, file });
      }}
    >
      <h2 className="text-lg font-semibold">{t('upload.title')}</h2>
      <SourceOptions
        options={options}
        disabled={disabled}
        onChange={setOptions}
        onFormatChange={() => {
          setFile(undefined);
          setFileError(undefined);
        }}
      />
      <FileUpload
        accept={options.format === 'vcard' ? '.vcf' : '.csv'}
        maxSize={5 * 1024 * 1024}
        maxFiles={1}
        disabled={disabled}
        files={file ? [file] : []}
        onFilesSelected={(files) => {
          setFile(files[0]);
          setFileError(undefined);
        }}
        onRemoveFile={() => setFile(undefined)}
        onError={(error) => setFileError(error.message)}
        prompt={t('upload.filePrompt')}
      />
      {fileError && (
        <p role="alert" className="text-destructive">
          {fileError}
        </p>
      )}
      <ParsingOptions options={options} disabled={disabled} onChange={setOptions} />
      <Button
        type="submit"
        disabled={disabled || !file || !options.sourceName.trim() || !options.collectionKey.trim()}
      >
        {t('upload.preview')}
      </Button>
      <p className="text-sm leading-6 text-foreground/85">{t('upload.preservation')}</p>
    </form>
  );
}

function ParsingOptions({
  options,
  disabled,
  onChange,
}: {
  options: Options;
  disabled: boolean;
  onChange: (options: Options) => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select
        label={t('upload.encoding')}
        disabled={disabled}
        value={options.encoding}
        options={[
          { value: 'utf8', label: 'UTF-8' },
          { value: 'utf16_le', label: t('upload.utf16le') },
          { value: 'utf16_be', label: t('upload.utf16be') },
          { value: 'windows1252', label: 'Windows-1252' },
        ]}
        onChange={(event) => {
          const encoding = event.target.value;
          if (
            encoding === 'utf8' ||
            encoding === 'utf16_le' ||
            encoding === 'utf16_be' ||
            encoding === 'windows1252'
          )
            onChange({ ...options, encoding });
        }}
      />
      <div className="space-y-2">
        <TextInput
          label={t('upload.country')}
          disabled={disabled}
          value={options.phoneCountryCode ?? ''}
          maxLength={2}
          pattern="[A-Z]{2}"
          placeholder={t('upload.countryPlaceholder')}
          onChange={(event) =>
            onChange({
              ...options,
              phoneCountryCode: event.target.value.trim().toUpperCase() || undefined,
            })
          }
        />
        <p className="text-sm text-foreground/85">{t('upload.countryHint')}</p>
      </div>
    </div>
  );
}

function SourceOptions({
  options,
  disabled,
  onChange,
  onFormatChange,
}: {
  options: Options;
  disabled: boolean;
  onChange: (options: Options) => void;
  onFormatChange: () => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(['vcard', 'google_csv'] as const).map((format) => (
          <Button
            key={format}
            type="button"
            disabled={disabled}
            variant={options.format === format ? 'default' : 'outline'}
            aria-pressed={options.format === format}
            onClick={() => {
              onChange({ ...options, format });
              onFormatChange();
            }}
          >
            {format === 'vcard' ? 'vCard' : 'Google CSV'}
          </Button>
        ))}
      </div>
      <TextInput
        label={t('upload.sourceName')}
        required
        disabled={disabled}
        value={options.sourceName}
        placeholder={t('upload.sourcePlaceholder')}
        onChange={(event) => onChange({ ...options, sourceName: event.target.value })}
      />
      <p className="text-sm text-foreground/85">{t('upload.sourceHint')}</p>
      <TextInput
        label={t('upload.addressBook')}
        required
        disabled={disabled}
        value={options.collectionKey}
        onChange={(event) => onChange({ ...options, collectionKey: event.target.value })}
      />
    </>
  );
}

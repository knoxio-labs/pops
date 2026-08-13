import { useState } from 'react';

import { FileUpload, type FileValidationError } from './FileUpload';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof FileUpload> = {
  title: 'Inputs/FileUpload',
  component: FileUpload,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onFilesSelected: () => {
      // Storybook action — nothing to stage in a static story.
    },
  },
};

export const Multiple: Story = {
  args: {
    multiple: true,
    onFilesSelected: () => {},
  },
};

/**
 * The default drop-zone prompt, the `accepts` hint and the remove-button
 * label all come from the `ui` translation catalog — none of it is baked
 * into the component in English only.
 */
export const DefaultCopyIsTranslated: Story = {
  render: () => {
    const [files, setFiles] = useState<File[]>([]);
    return (
      <FileUpload
        multiple
        accept="image/jpeg,image/png,.pdf"
        files={files}
        onFilesSelected={(chosen) => setFiles((prev) => [...prev, ...chosen])}
        onRemoveFile={(i) => setFiles((prev) => prev.filter((_, index) => index !== i))}
      />
    );
  },
};

/**
 * `onError` receives a structured reason — the rejected file, the rule it
 * broke, the bound — rather than a rendered sentence. The default `message`
 * on that reason is the library's own translated copy.
 */
export const DefaultErrorCopy: Story = {
  render: () => {
    const [error, setError] = useState<string | null>(null);
    return (
      <div className="space-y-2">
        <FileUpload
          accept="image/jpeg,.pdf"
          maxSize={1024}
          onFilesSelected={() => setError(null)}
          onError={(e: FileValidationError) => setError(e.message)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  },
};

/**
 * A consumer that wants its own wording — a different language, or copy that
 * names the feature rather than the file — ignores `error.message` and
 * builds a sentence from `error.type` plus the structured fields instead.
 * `accept` still filters the OS file dialog: nothing was given up to get
 * custom copy.
 */
export const ConsumerOwnedCopy: Story = {
  render: () => {
    const [problem, setProblem] = useState<string | null>(null);

    const describe = (e: FileValidationError): string => {
      switch (e.type) {
        case 'not-accepted':
          return `Este comprovante só aceita ${e.accept} — "${e.file.name}" não serve.`;
        case 'too-large':
          return `"${e.file.name}" é grande demais para um comprovante.`;
        case 'too-many':
          return `Envie no máximo ${String(e.maxFiles)} comprovante(s) por vez.`;
      }
    };

    return (
      <div className="space-y-2">
        <FileUpload
          multiple
          maxFiles={2}
          accept="image/jpeg,image/png,.pdf"
          prompt="Solte o comprovante aqui"
          onFilesSelected={() => setProblem(null)}
          onError={(e) => setProblem(describe(e))}
        />
        {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      </div>
    );
  },
};

export const WithMaxSize: Story = {
  render: () => {
    const [error, setError] = useState<string | null>(null);
    return (
      <div className="space-y-2">
        <FileUpload
          maxSize={1024 * 1024}
          onFilesSelected={() => setError(null)}
          onError={(e) => setError(e.message)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    onFilesSelected: () => {},
  },
};

export const CustomPrompt: Story = {
  args: {
    prompt: 'Drop your receipt here',
    onFilesSelected: () => {},
  },
};

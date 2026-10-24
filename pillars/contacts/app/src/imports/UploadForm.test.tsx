import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UploadForm } from './UploadForm';

import type { FileImportInput } from './contracts';

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing export picker');
  return input;
}

async function chooseFile(container: HTMLElement, country?: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Source name' }), 'Personal address book');
  await user.upload(
    fileInput(container),
    new File(['BEGIN:VCARD\nEND:VCARD'], 'contacts.vcf', { type: 'text/vcard' })
  );
  if (country)
    await user.type(
      screen.getByRole('textbox', { name: 'Phone country (optional ISO code)' }),
      country
    );
  await user.click(screen.getByRole('button', { name: 'Preview contacts' }));
}

describe('contact export parsing choices', () => {
  it('does not infer a phone country and preserves the selected file/source metadata', async () => {
    const stage = vi.fn<(input: FileImportInput) => void>();
    const { container } = render(<UploadForm disabled={false} onStage={stage} />);
    await chooseFile(container);
    expect(stage).toHaveBeenCalledTimes(1);
    expect(stage.mock.calls[0]?.[0]).toMatchObject({
      format: 'vcard',
      encoding: 'utf8',
      sourceName: 'Personal address book',
      collectionKey: 'contacts',
    });
    expect(stage.mock.calls[0]?.[0]?.phoneCountryCode).toBeUndefined();
  });
  it('passes an explicitly entered country and clears an incompatible file when format changes', async () => {
    const stage = vi.fn<(input: FileImportInput) => void>();
    const { container } = render(<UploadForm disabled={false} onStage={stage} />);
    await chooseFile(container, 'br');
    expect(stage.mock.calls[0]?.[0]?.phoneCountryCode).toBe('BR');
    await userEvent.click(screen.getByRole('button', { name: 'Google CSV' }));
    expect(screen.getByRole('button', { name: 'Preview contacts' })).toBeDisabled();
    expect(fileInput(container)).toHaveAttribute('accept', '.csv');
  });
});

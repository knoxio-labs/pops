import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EntityAvatarField } from './EntityAvatarField';
import { type Entity } from './types';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    name: 'Woolworths',
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    avatarAssetId: null,
    colour: null,
    ...overrides,
  };
}

async function chooseFile(file: File) {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input not found');
  await userEvent.upload(input, file);
}

describe('EntityAvatarField', () => {
  it('calls uploadAvatar with the chosen file', async () => {
    const uploadAvatar = vi.fn();
    render(
      <EntityAvatarField
        entity={makeEntity()}
        uploadAvatar={uploadAvatar}
        removeAvatar={vi.fn()}
        uploadIsPending={false}
        removeIsPending={false}
        onError={vi.fn()}
      />
    );

    const file = new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' });
    await chooseFile(file);

    expect(uploadAvatar).toHaveBeenCalledExactlyOnceWith(file);
  });

  it('does not show a remove control when the entity has no avatar', () => {
    render(
      <EntityAvatarField
        entity={makeEntity({ avatarAssetId: null })}
        uploadAvatar={vi.fn()}
        removeAvatar={vi.fn()}
        uploadIsPending={false}
        removeIsPending={false}
        onError={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /remove avatar/i })).toBeNull();
  });

  it('calls removeAvatar when the remove control is clicked, once an avatar is set', async () => {
    const removeAvatar = vi.fn();
    const user = userEvent.setup();
    render(
      <EntityAvatarField
        entity={makeEntity({ avatarAssetId: 'blob-1' })}
        uploadAvatar={vi.fn()}
        removeAvatar={removeAvatar}
        uploadIsPending={false}
        removeIsPending={false}
        onError={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /remove avatar/i }));

    expect(removeAvatar).toHaveBeenCalledOnce();
  });

  it('surfaces a file-validation rejection through onError (a dragged-in file bypasses accept)', () => {
    const onError = vi.fn();
    const uploadAvatar = vi.fn();
    render(
      <EntityAvatarField
        entity={makeEntity()}
        uploadAvatar={uploadAvatar}
        removeAvatar={vi.fn()}
        uploadIsPending={false}
        removeIsPending={false}
        onError={onError}
      />
    );

    const badFile = new File(['not an image'], 'invoice.pdf', { type: 'application/pdf' });
    fireEvent.drop(screen.getByRole('button'), { dataTransfer: { files: [badFile] } });

    expect(onError).toHaveBeenCalledOnce();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });
});

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { EntityFormDialog } from './EntityFormDialog';
import { DEFAULT_FORM_VALUES, type Entity, EntityFormSchema, type EntityFormValues } from './types';

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent-1',
    name: 'Woolworths',
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    avatarAssetId: null,
    colour: '#e04667',
    ...overrides,
  };
}

interface HarnessProps {
  editingEntity?: Entity | null;
  uploadAvatar?: (entityId: string, file: File) => void;
  removeAvatar?: (entityId: string) => void;
  rerollColour?: (entityId: string) => void;
}

function Harness({
  editingEntity = null,
  uploadAvatar = vi.fn(),
  removeAvatar = vi.fn(),
  rerollColour = vi.fn(),
}: HarnessProps) {
  const form = useForm<EntityFormValues>({
    resolver: standardSchemaResolver(EntityFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });
  return (
    <EntityFormDialog
      open
      onOpenChange={vi.fn()}
      editingEntity={editingEntity}
      form={form}
      isSubmitting={false}
      onSubmit={vi.fn()}
      uploadAvatar={uploadAvatar}
      removeAvatar={removeAvatar}
      avatarUploadIsPending={false}
      avatarRemoveIsPending={false}
      rerollColour={rerollColour}
      colourRerollIsPending={false}
      onAvatarError={vi.fn()}
    />
  );
}

describe('EntityFormDialog — scrolling', () => {
  it('caps the dialog content height and scrolls internally, so the header and footer stay reachable on a short viewport', () => {
    render(<Harness editingEntity={entity()} />);
    const content = screen.getByRole('dialog');
    expect(content.className).toMatch(/max-h-\[90vh\]/);
    expect(content.className).toMatch(/overflow-y-auto/);
  });
});

describe('EntityFormDialog — avatar and colour', () => {
  it('shows no avatar or colour section when creating a new entity', () => {
    render(<Harness editingEntity={null} />);
    expect(screen.queryByText('Avatar')).not.toBeInTheDocument();
    expect(screen.queryByText('Colour')).not.toBeInTheDocument();
  });

  it('shows the avatar and colour sections when editing an existing entity', () => {
    render(<Harness editingEntity={entity()} />);
    expect(screen.getByText('Avatar')).toBeInTheDocument();
    expect(screen.getByText('Colour')).toBeInTheDocument();
  });

  it('offers "Remove avatar" only once one is set', () => {
    render(<Harness editingEntity={entity({ avatarAssetId: null })} />);
    expect(screen.queryByRole('button', { name: 'Remove avatar' })).not.toBeInTheDocument();

    render(<Harness editingEntity={entity({ avatarAssetId: 'asset-1' })} />);
    expect(screen.getByRole('button', { name: 'Remove avatar' })).toBeInTheDocument();
  });

  it('calls removeAvatar with the entity id when "Remove avatar" is clicked', async () => {
    const user = userEvent.setup();
    const removeAvatar = vi.fn();
    render(
      <Harness editingEntity={entity({ avatarAssetId: 'asset-1' })} removeAvatar={removeAvatar} />
    );

    await user.click(screen.getByRole('button', { name: 'Remove avatar' }));

    expect(removeAvatar).toHaveBeenCalledWith('ent-1');
  });

  it('calls rerollColour with the entity id when "Shuffle" is clicked', async () => {
    const user = userEvent.setup();
    const rerollColour = vi.fn();
    render(<Harness editingEntity={entity()} rerollColour={rerollColour} />);

    await user.click(screen.getByRole('button', { name: /Shuffle/ }));

    expect(rerollColour).toHaveBeenCalledWith('ent-1');
  });
});

import { entityColour, initials } from '@/fixtures/entities';

import { Avatar, AvatarFallback, AvatarImage } from '@pops/ui';

import { directoryKinds } from './model';

import type { DirectoryContact } from './model';

/** Expand the existing identity once, preserving its configured image/colour and source-derived location. */
export function DirectoryIdentity({ contact }: { contact: DirectoryContact }) {
  const entity = contact.legacy ?? { id: contact.id, name: contact.name, type: contact.kind };
  const colour = entityColour(entity);
  const cities = [...new Set(contact.addresses.map((address) => address.city).filter(Boolean))];
  const kind = directoryKinds.find((item) => item.kind === contact.kind)?.label;
  return (
    <span className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4">
      <Avatar className="size-20 border border-foreground/20">
        <AvatarImage src={entity.avatar} alt="" />
        <AvatarFallback
          className="text-2xl font-medium text-app-accent bg-app-accent/15"
          style={colour ? { backgroundColor: colour.tint, color: colour.swatch } : undefined}
        >
          {initials(contact.name)}
        </AvatarFallback>
      </Avatar>
      <span className="block max-w-full break-words text-2xl font-semibold leading-tight text-foreground">
        {contact.name}
      </span>
      <span className="block max-w-full whitespace-normal text-sm text-muted-foreground">
        {[kind, cities.join(', ')].filter(Boolean).join(' · ')}
      </span>
    </span>
  );
}

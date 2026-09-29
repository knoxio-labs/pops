import { ArrowUp, Calendar, Hash, MapPin, PackageOpen, Ruler, Tag, Weight } from 'lucide-react';

import { cn } from '../lib/utils';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/** Icon choices supported by field metadata and other shared UI surfaces. */
export const FIELD_ICON_OPTIONS = [
  { value: 'PackageOpenUp', label: 'Open package with upward arrow' },
  { value: 'PackageOpen', label: 'Open package' },
  { value: 'MapPin', label: 'Map pin' },
  { value: 'Calendar', label: 'Calendar' },
  { value: 'Tag', label: 'Tag' },
  { value: 'Ruler', label: 'Ruler' },
  { value: 'Weight', label: 'Weight' },
  { value: 'Hash', label: 'Hash' },
] as const satisfies readonly { value: string; label: string }[];

/** A name accepted by `FieldIcon`. */
export type FieldIconName = (typeof FIELD_ICON_OPTIONS)[number]['value'];

const FIELD_ICONS = {
  PackageOpen,
  MapPin,
  Calendar,
  Tag,
  Ruler,
  Weight,
  Hash,
} satisfies Record<Exclude<FieldIconName, 'PackageOpenUp'>, LucideIcon>;

/** Returns whether an unknown value names a supported field icon. */
export function isFieldIconName(value: unknown): value is FieldIconName {
  return typeof value === 'string' && FIELD_ICON_OPTIONS.some((option) => option.value === value);
}

/** Props for the decorative, current-colour `FieldIcon` glyph. */
export interface FieldIconProps {
  name: string;
  size?: number | string;
  className?: string;
}

function PackageOpenUp({ size, className }: Omit<FieldIconProps, 'name'>): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex shrink-0 align-middle', className)}
      style={{ width: size, height: size }}
    >
      <PackageOpen
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 size-3/4 -translate-x-1/2"
      />
      <ArrowUp aria-hidden="true" className="absolute top-0 left-1/2 size-1/2 -translate-x-1/2" />
    </span>
  );
}

/**
 * Renders a synchronous decorative field icon, or `null` when `name` is not
 * one of the curated names in `FIELD_ICON_OPTIONS`.
 */
export function FieldIcon({ name, size = '1em', className }: FieldIconProps): ReactElement | null {
  if (!isFieldIconName(name)) return null;

  if (name === 'PackageOpenUp') {
    return <PackageOpenUp size={size} className={className} />;
  }

  const Icon = FIELD_ICONS[name];
  return <Icon aria-hidden="true" size={size} className={className} />;
}

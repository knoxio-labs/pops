import { Button, ButtonPrimitive, cn } from '@pops/ui';

import { HintTooltip } from '../shortcuts/hint-tooltip';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/** Props for a read-only-safe item-page action. */
export interface VerbButtonProps {
  label: string;
  icon?: LucideIcon;
  shortcutId?: string;
  disabledReason?: string;
  detail?: string;
  variant?: 'default' | 'outline' | 'ghost';
  iconOnly?: boolean;
  compact?: boolean;
  size?: 'sm' | 'default';
  onClick?: () => void;
  className?: string;
}

function iconSize(compact: boolean, size: 'sm' | 'default'): 'icon-xs' | 'icon-sm' | 'icon' {
  if (compact) return 'icon-xs';
  return size === 'default' ? 'icon' : 'icon-sm';
}

/** Renders an item-page action with its shortcut and disabled explanation. */
export function VerbButton({
  label,
  icon: Icon,
  shortcutId,
  disabledReason,
  detail,
  variant = 'outline',
  iconOnly = false,
  compact = false,
  size = 'sm',
  onClick,
  className,
}: VerbButtonProps): ReactElement {
  const refused = disabledReason !== undefined;
  const tooltip = detail === undefined ? label : `${label}. ${detail}`;
  const shared = {
    'aria-disabled': refused || undefined,
    onClick: refused ? undefined : onClick,
  };
  const glyph = Icon ? <Icon className="size-4" aria-hidden /> : undefined;
  const button = iconOnly ? (
    <ButtonPrimitive
      variant={variant}
      size={iconSize(compact, size)}
      aria-label={label}
      className={cn(refused && 'opacity-50', className)}
      {...shared}
    >
      {glyph}
    </ButtonPrimitive>
  ) : (
    <Button
      size={size}
      variant={variant}
      className={cn('whitespace-nowrap', refused && 'opacity-50', className)}
      prefix={glyph}
      {...shared}
    >
      {label}
    </Button>
  );

  return (
    <HintTooltip label={tooltip} shortcutId={shortcutId} disabledReason={disabledReason}>
      {button}
    </HintTooltip>
  );
}

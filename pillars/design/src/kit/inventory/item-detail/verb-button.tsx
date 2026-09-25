/**
 * The one button shape item pages use for a verb: icon, label, its key in
 * the tooltip, and a refusal that keeps the button visible, dimmed, with the
 * reason as its tooltip instead of silently disabling it (spec 3.2).
 */
import { Button, ButtonPrimitive, cn } from '@pops/ui';

import { HintTooltip } from '../foundation';

import type { LucideIcon } from 'lucide-react';

/** Props for {@link VerbButton}. */
export interface VerbButtonProps {
  label: string;
  icon?: LucideIcon;
  shortcutId?: string;
  disabledReason?: string;
  /** A second tooltip line beyond the label, such as where Put back goes. */
  detail?: string;
  variant?: 'default' | 'outline' | 'ghost';
  iconOnly?: boolean;
  /** Icon-only at 32px, with the hit area still expanded to 44px. */
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}

/** A verb button with its hint tooltip. */
export function VerbButton({
  label,
  icon: Icon,
  shortcutId,
  disabledReason,
  detail,
  variant = 'outline',
  iconOnly = false,
  compact = false,
  onClick,
  className,
}: VerbButtonProps) {
  const refused = disabledReason !== undefined;
  const tip = detail === undefined ? label : `${label}. ${detail}`;
  const shared = {
    'aria-disabled': refused || undefined,
    onClick: refused ? undefined : onClick,
  };
  const glyph = Icon ? <Icon className="size-4" aria-hidden /> : undefined;
  const button = iconOnly ? (
    <ButtonPrimitive
      variant={variant}
      size={compact ? 'icon-xs' : 'icon-sm'}
      aria-label={label}
      className={cn(refused && 'opacity-50', className)}
      {...shared}
    >
      {glyph}
    </ButtonPrimitive>
  ) : (
    <Button
      size="sm"
      variant={variant}
      className={cn('whitespace-nowrap', refused && 'opacity-50', className)}
      prefix={glyph}
      {...shared}
    >
      {label}
    </Button>
  );
  return (
    <HintTooltip label={tip} shortcutId={shortcutId} disabledReason={disabledReason}>
      {button}
    </HintTooltip>
  );
}

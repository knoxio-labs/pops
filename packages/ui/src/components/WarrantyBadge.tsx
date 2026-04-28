import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';

import type { ComponentProps } from 'react';

type WarrantyState = 'expired' | 'expiring' | 'active' | 'none';

interface WarrantyInfo {
  state: WarrantyState;
  label: string;
}

const warrantyStyles: Record<WarrantyState, string> = {
  expired: 'bg-destructive/10 text-destructive border-destructive/20 dark:text-destructive/80',
  expiring: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400',
  active: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
  none: 'bg-zinc-500/10 text-zinc-700 border-zinc-500/20 dark:text-zinc-400',
};

/** Compute warranty status from an expiry date string (or null). */
export function getWarrantyStatus(warrantyExpiry: string | null): WarrantyInfo {
  if (!warrantyExpiry) return { state: 'none', label: 'No warranty' };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(warrantyExpiry);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) return { state: 'expired', label: 'Expired' };
  if (days <= 90) return { state: 'expiring', label: `${days}` };

  const formatted = expiry.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return { state: 'active', label: formatted };
}

function useWarrantyLabel(info: WarrantyInfo): string {
  const { t } = useTranslation('ui');
  switch (info.state) {
    case 'none':
      return t('warranty.noWarranty');
    case 'expired':
      return t('warranty.expired');
    case 'expiring':
      return t('warranty.expiresInDays', { days: info.label });
    case 'active':
      return t('warranty.warrantyUntil', { date: info.label });
  }
}

export interface WarrantyBadgeProps extends Omit<
  ComponentProps<typeof Badge>,
  'variant' | 'children'
> {
  warrantyExpiry: string | null;
}

export function WarrantyBadge({ warrantyExpiry, className, ...props }: WarrantyBadgeProps) {
  const info = getWarrantyStatus(warrantyExpiry);
  const { state } = info;
  const label = useWarrantyLabel(info);
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-2xs uppercase tracking-wider font-semibold py-0 px-1.5 h-5',
        warrantyStyles[state],
        className
      )}
      {...props}
    >
      {label}
    </Badge>
  );
}

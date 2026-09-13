/**
 * Ported from `pillars/inventory/app/src/pages/insurance-report-page/warranty.ts`.
 *
 * The source reads `new Date()` directly, so its tier is only ever relative
 * to whatever instant the browser happens to render it at. Ported here as a
 * `now` parameter instead, the same deviation `warranties/categorize.ts`
 * takes for the same reason: a canvas state renders once, and a hardcoded
 * "today" would drift a fixture's warranty into the wrong tier the moment
 * real time passes it.
 */
import { formatDate } from '@pops/ui';

export interface WarrantyStatus {
  label: string;
  variant: 'default' | 'destructive' | 'secondary';
}

export function warrantyStatus(expiryStr: string | null, now: Date): WarrantyStatus {
  if (!expiryStr) return { label: 'None', variant: 'secondary' };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryStr);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: 'Expired', variant: 'destructive' };
  if (days <= 90) return { label: `${days}d left`, variant: 'default' };
  return { label: formatDate(expiryStr), variant: 'secondary' };
}

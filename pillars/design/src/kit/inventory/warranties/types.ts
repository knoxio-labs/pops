export interface WarrantyItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  model: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
  warrantyDocumentId: number | null;
}

export type WarrantyEntry = WarrantyItem & { daysRemaining: number };

export interface TierConfig {
  label: string;
  borderColor: string;
  bgColor: string;
  headerBg: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

/**
 * The tier headings the page renders, verbatim. The playground writes no em
 * dashes of its own, but this is the app's own user-facing copy rather than
 * prose about it: changing the punctuation would put a label on the canvas
 * that no user has ever seen. Same reasoning as the chart's zero placeholder.
 */
export const TIER_STYLES: Record<string, TierConfig> = {
  critical: {
    label: 'Critical — Under 30 Days',
    borderColor: 'border-destructive/20',
    bgColor: 'bg-destructive/5',
    headerBg: 'bg-destructive/10',
    dotColor: 'bg-destructive/50',
    badgeBg: 'bg-destructive/20',
    badgeText: 'text-destructive',
    badgeBorder: 'border-destructive/30',
  },
  warning: {
    label: 'Warning — 30 to 60 Days',
    borderColor: 'border-warning/20',
    bgColor: 'bg-warning/5',
    headerBg: 'bg-warning/10',
    dotColor: 'bg-warning/50',
    badgeBg: 'bg-warning/20',
    badgeText: 'text-warning',
    badgeBorder: 'border-warning/30',
  },
  caution: {
    label: 'Caution — 60 to 90 Days',
    borderColor: 'border-stat-orange/20',
    bgColor: 'bg-stat-orange/5',
    headerBg: 'bg-stat-orange/10',
    dotColor: 'bg-stat-orange',
    badgeBg: 'bg-stat-orange/20',
    badgeText: 'text-stat-orange',
    badgeBorder: 'border-stat-orange/30',
  },
};

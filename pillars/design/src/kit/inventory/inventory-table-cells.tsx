/**
 * Cell renderers for {@link InventoryTable}: empty cells say "Not set" in
 * words, and a condition the badge does not know is treated as not set.
 */
import {
  type Condition,
  ConditionBadge,
  formatAUD,
  formatDate,
  LocationBreadcrumb,
  type LocationSegment,
} from '@pops/ui';

/** Known condition values (lowercase canonical + legacy Title Case). */
const VALID_CONDITIONS = new Set<string>([
  'new',
  'good',
  'fair',
  'poor',
  'broken',
  // Legacy Title Case values from seed data / Notion import
  'Excellent',
  'Good',
  'Fair',
  'Poor',
]);

/** An empty cell, said in words rather than a dash. */
export function NotSet() {
  return <span className="text-xs text-muted-foreground">Not set</span>;
}

/** The location breadcrumb, the flat name, or Not set. */
export function locationCell(
  locationPathMap: ReadonlyMap<string, LocationSegment[]>,
  row: { original: { locationId: string | null; location: string | null } }
): React.ReactNode {
  const { locationId, location } = row.original;
  const segments = locationId ? locationPathMap.get(locationId) : undefined;
  if (segments && segments.length > 0) {
    return (
      <span title={segments.map((s) => s.name).join(' > ')}>
        <LocationBreadcrumb segments={segments} />
      </span>
    );
  }
  return location ? <span>{location}</span> : <NotSet />;
}

function isCondition(value: string): value is Condition {
  return VALID_CONDITIONS.has(value);
}

/** A condition badge, or Not set for a missing or unknown condition. */
export function conditionCell(condition: string | null): React.ReactNode {
  if (!condition || !isCondition(condition)) return <NotSet />;
  return <ConditionBadge condition={condition} />;
}

/** The purchase date, or Not set. */
export function purchaseDateCell(date: string | null): React.ReactNode {
  if (!date) return <NotSet />;
  return <span className="text-sm tabular-nums">{formatDate(date)}</span>;
}

/** The replacement value in AUD, or Not set. */
export function valueCell(value: number | null): React.ReactNode {
  return value != null ? formatAUD(value) : <NotSet />;
}

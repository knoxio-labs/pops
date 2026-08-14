import { getResultComponent } from '../result-component-registry';

import type { ReactNode } from 'react';

import type { SearchResultHit, SearchResultSection } from '../SearchResultsPanel';
import type { SearchHitData } from '../uri-resolver';

/**
 * Section colour names arrive over the wire as bare hue words. Each maps onto
 * a distinct design token rather than a raw palette utility, so a section
 * header answers to the theme in both modes.
 */
const COLOR_CLASSES: Record<string, string> = {
  purple: 'text-stat-violet',
  green: 'text-success',
  blue: 'text-info',
  red: 'text-destructive',
  orange: 'text-stat-orange',
  yellow: 'text-warning',
  pink: 'text-stat-rose',
  cyan: 'text-stat-sky',
};

interface SectionHeaderProps {
  icon: ReactNode;
  label: string;
  count: number;
  color: string;
}

function SectionHeader({ icon, label, count, color }: SectionHeaderProps) {
  const colorClass = COLOR_CLASSES[color] ?? 'text-foreground';
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${colorClass}`}
      data-testid={`section-header-${label.toLowerCase().replaceAll(/\s+/g, '-')}`}
    >
      {icon}
      <span>{label}</span>
      <span className="ml-auto text-muted-foreground font-normal">{count}</span>
    </div>
  );
}

interface ResultButtonProps {
  hit: SearchResultHit;
  query: string;
  index: number;
  isSelected: boolean;
  onResultClick?: (uri: string, data: SearchHitData) => void;
  ResultComponent: ReturnType<typeof getResultComponent>;
}

function ResultButton({
  hit,
  query,
  index,
  isSelected,
  onResultClick,
  ResultComponent,
}: ResultButtonProps) {
  return (
    <li>
      <button
        type="button"
        className={`w-full cursor-pointer rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none${isSelected ? ' bg-accent' : ''}`}
        onClick={() => onResultClick?.(hit.uri, hit.data)}
        data-uri={hit.uri}
        data-result-index={index}
      >
        <ResultComponent
          data={hit.data}
          query={query}
          matchField={hit.matchField}
          matchType={hit.matchType}
        />
      </button>
    </li>
  );
}

export interface SectionViewProps {
  section: SearchResultSection;
  query: string;
  startIndex: number;
  selectedIndex: number;
  onResultClick?: (uri: string, data: SearchHitData) => void;
  onShowMore?: (domain: string) => void;
}

export function SectionView({
  section,
  query,
  startIndex,
  selectedIndex,
  onResultClick,
  onShowMore,
}: SectionViewProps) {
  const ResultComponent = getResultComponent(section.domain);
  return (
    <div
      className={section.isContext ? 'border-l-2 border-l-primary bg-accent/30' : ''}
      data-testid={`section-${section.domain}`}
    >
      <SectionHeader
        icon={section.icon}
        label={section.label}
        count={section.totalCount}
        color={section.color}
      />
      <ul className="px-1 pb-1">
        {section.hits.map((hit, i) => (
          <ResultButton
            key={hit.uri}
            hit={hit}
            query={query}
            index={startIndex + i}
            isSelected={startIndex + i === selectedIndex}
            onResultClick={onResultClick}
            ResultComponent={ResultComponent}
          />
        ))}
      </ul>
      {section.totalCount > section.hits.length && (
        <button
          type="button"
          className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground text-left hover:bg-accent/50 transition-colors"
          onClick={() => onShowMore?.(section.domain)}
          data-testid={`show-more-${section.domain}`}
        >
          Show more ({section.totalCount - section.hits.length} remaining)
        </button>
      )}
    </div>
  );
}

/**
 * E1 variant `stacked`: one max-w-3xl column. Photo and facts share the top
 * card; connections, documents, provenance and history follow as folded
 * rows that each say what is inside, one open at a time. The column never
 * outgrows the page: the open section's body is what scrolls.
 */
import { FactsSection } from './facts-section';
import { PhotosSection } from './photos-section';
import { SectionStack } from './section-stack';

import type { DetailBodyProps } from './layout-types';

/** The stacked body. */
export function StackedBody({ model, condition, readOnly, sections, onQuantity }: DetailBodyProps) {
  return (
    <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4">
      <div className="flex shrink-0 gap-4 rounded-xl border bg-card p-4">
        <PhotosSection
          photos={model.photos}
          itemName={model.item.name}
          broken={condition.brokenPhoto}
          disabledReason={readOnly ? 'Nothing can change on this item.' : undefined}
        />
        <div className="@container min-w-0 flex-1">
          <FactsSection
            facts={model.facts}
            typeName={model.item.typeName}
            condition={condition}
            readOnly={readOnly}
            onQuantity={onQuantity}
          />
        </div>
      </div>
      <SectionStack sections={sections} initialOpen={condition.openSection ?? null} />
    </div>
  );
}

import { ChevronUp } from 'lucide-react';

import { DockGroupLabel, DockRow, DockTool } from './dock-parts';
import { useSurfaceCoords } from './use-surface-coords';
import { buildVariantContext, type DockOption } from './variant-options';

import type { Catalog } from '../registry';

function trailingOf(option: DockOption): string | undefined {
  if (option.disabledNote) return option.disabledNote;
  if (option.chosen) return 'chosen ✓';
  return option.isCurrent ? '●' : undefined;
}

/**
 * Dock tool: which design is on the canvas — Main, or a variant of the
 * experiment attached to this screen. Flipping preserves step and state
 * where the target realises them. Hidden when no experiment applies here.
 */
export function VariantTool({ catalog }: { catalog: Catalog }) {
  const coords = useSurfaceCoords();
  const current = coords?.screenId
    ? { screenId: coords.screenId, stepId: coords.stepId, state: coords.state }
    : null;
  const active = coords?.experimentId
    ? { experimentId: coords.experimentId, variantId: coords.variantId }
    : undefined;
  const context = buildVariantContext(catalog, current, active);
  if (!context) return null;
  const { currentExperiment, currentVariant, groups, mainOption } = context;

  const currentLabel = currentVariant
    ? `${currentExperiment?.name} · ${currentVariant.name}`
    : 'Main';

  return (
    <DockTool
      label={`Design: ${currentLabel}`}
      width="w-64"
      trigger={
        <span className="inline-flex items-center gap-1.5 text-sm">
          {currentLabel}
          <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
        </span>
      }
    >
      <DockRow
        current={mainOption.isCurrent}
        to={mainOption.to}
        disabled={!mainOption.to}
        trailing={trailingOf(mainOption)}
      >
        {mainOption.label}
      </DockRow>
      {groups.map(({ experiment, options }) => (
        <div key={experiment.id}>
          <DockGroupLabel>{experiment.name}</DockGroupLabel>
          {options.map((option) => (
            <DockRow
              key={option.key}
              current={option.isCurrent}
              to={option.to}
              trailing={trailingOf(option)}
            >
              {option.label}
            </DockRow>
          ))}
        </div>
      ))}
    </DockTool>
  );
}

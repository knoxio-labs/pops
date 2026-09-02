import { useSearchParams } from 'react-router';

import { DockRow, DockTool } from './dock-parts';
import { resolveSurface, statesAt } from './surface';
import { useSurfaceCoords } from './use-surface-coords';

import type { Catalog } from '../registry';

/**
 * The state switcher: lists the named states of the current surface (the
 * active step if a flow, else the screen) plus Default, and drives the
 * `?state=` coordinate. Renders nothing when the surface has no named states.
 */
export function StateTool({ catalog }: { catalog: Catalog }) {
  const coords = useSurfaceCoords();
  const [searchParams, setSearchParams] = useSearchParams();

  const states = coords ? statesAt(resolveSurface(catalog, coords)) : [];
  if (states.length === 0) return null;

  const current = searchParams.get('state') ?? 'default';
  const select = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'default') next.delete('state');
    else next.set('state', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <DockTool
      label={`State: ${current}`}
      active={current !== 'default'}
      width="w-52"
      trigger={<span className="text-sm">{current}</span>}
    >
      {['default', ...states].map((id) => (
        <DockRow key={id} current={id === current} onSelect={() => select(id)}>
          {id}
        </DockRow>
      ))}
    </DockTool>
  );
}

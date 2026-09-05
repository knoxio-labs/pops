import { describe, expect, it } from 'vitest';

import { buildCatalog } from '../registry/catalog';
import { makeScreen } from '../test/factories';
import { parseAddress } from './address';
import { declaredFrame, surfaceKeyOf } from './declared-frame';

import type { FrameKind } from '../frames/kind';
import type { Catalog, ExperimentEntry, ScreenEntry } from '../registry';

function screen(id: string, frame?: FrameKind, steps?: ScreenEntry[]): ScreenEntry {
  return makeScreen({ id, title: id, order: 1, frame, steps, component: undefined });
}

function catalogOf(screens: ScreenEntry[], experiments: ExperimentEntry[] = []): Catalog {
  return { screens, experiments, errors: [] };
}

function frameAt(catalog: Catalog, path: string, search = ''): FrameKind | undefined {
  return declaredFrame(catalog, parseAddress(path, search));
}

describe('declaredFrame', () => {
  it('is undefined for a screen that says nothing, so the current frame stands', () => {
    const catalog = catalogOf([screen('finance/import-review')]);
    expect(frameAt(catalog, '/s/finance/import-review')).toBeUndefined();
  });

  it('reads the frame a screen declares', () => {
    const catalog = catalogOf([screen('finance/account-detail', 'web')]);
    expect(frameAt(catalog, '/s/finance/account-detail')).toBe('web');
  });

  it('is undefined for an address that resolves to no screen', () => {
    const catalog = catalogOf([screen('finance/account-detail', 'web')]);
    expect(frameAt(catalog, '/s/finance/does-not-exist')).toBeUndefined();
  });

  it('is undefined off a screen address entirely', () => {
    expect(declaredFrame(catalogOf([]), parseAddress('/tokens'))).toBeUndefined();
  });

  it('lets a flow step override the flow it belongs to', () => {
    const step = screen('finance/import-wizard/scan', 'none');
    const catalog = catalogOf([screen('finance/import-wizard', 'web', [step])]);
    // The step is the surface on the canvas, and it declares `none` — which
    // is a declaration, not an absence, so it beats the flow's `web`.
    expect(frameAt(catalog, '/s/finance/import-wizard', '?step=scan')).toBe('none');
  });

  it('falls back to the flow for a step that declares nothing', () => {
    const step = screen('finance/import-wizard/scan');
    const catalog = catalogOf([screen('finance/import-wizard', 'web', [step])]);
    expect(frameAt(catalog, '/s/finance/import-wizard', '?step=scan')).toBe('web');
  });

  it('falls back to the experiment when its variant screen declares nothing', () => {
    const variantScreen = screen('finance/import-review');
    const experiment: ExperimentEntry = {
      id: 'density',
      name: 'Density',
      status: 'active',
      screen: 'finance/import-review',
      frame: 'web',
      variants: [{ id: 'cards', name: 'Card grid', screens: [variantScreen] }],
    };
    const catalog = catalogOf([screen('finance/import-review')], [experiment]);
    expect(frameAt(catalog, '/x/density/cards/s/finance/import-review')).toBe('web');
  });

  it('prefers the variant screen over the experiment', () => {
    const experiment: ExperimentEntry = {
      id: 'density',
      name: 'Density',
      status: 'active',
      screen: 'finance/import-review',
      frame: 'web',
      variants: [
        { id: 'cards', name: 'Card grid', screens: [screen('finance/import-review', 'none')] },
      ],
    };
    const catalog = catalogOf([screen('finance/import-review')], [experiment]);
    // `none` rather than a second frame: the variant and the experiment must
    // disagree or this passes on a resolver that ignored the variant entirely.
    expect(frameAt(catalog, '/x/density/cards/s/finance/import-review')).toBe('none');
  });
});

describe('surfaceKeyOf', () => {
  it('is stable across a state change, so a hand-picked frame survives it', () => {
    expect(surfaceKeyOf(parseAddress('/s/finance/account-detail', '?state=empty'))).toBe(
      surfaceKeyOf(parseAddress('/s/finance/account-detail'))
    );
  });

  it('is stable across a step change within one flow', () => {
    expect(surfaceKeyOf(parseAddress('/s/finance/import-wizard', '?step=scan'))).toBe(
      surfaceKeyOf(parseAddress('/s/finance/import-wizard', '?step=review'))
    );
  });

  it('changes when the screen changes', () => {
    expect(surfaceKeyOf(parseAddress('/s/finance/account-detail'))).not.toBe(
      surfaceKeyOf(parseAddress('/s/finance/import-review'))
    );
  });

  it('changes when the variant changes on one screen', () => {
    expect(surfaceKeyOf(parseAddress('/x/density/cards/s/finance/import-review'))).not.toBe(
      surfaceKeyOf(parseAddress('/x/density/table/s/finance/import-review'))
    );
  });
});

describe('the checked-in design surface', () => {
  it('opens a screen that declares a frame inside it, without touching the dock', () => {
    const catalog = buildCatalog();
    expect(frameAt(catalog, '/s/finance/accounts')).toBe('web');
  });
});

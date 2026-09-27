import type { PaletteScope } from './palette-groups.js';

/** Reads the palette scope from the Search route without changing the URL. */
export function paletteScopeFromUrl(pathname: string, search: string): PaletteScope {
  if (pathname.replace(/\/+$/u, '') !== '/inventory/search') return 'inventory';
  return new URLSearchParams(search).get('scope') === 'purchases' ? 'purchases' : 'inventory';
}

let paletteOpener: (() => void) | null = null;

/** Sets the inventory palette opener used by the compact TopBar search. */
export function setPaletteOpener(open: (() => void) | null): void {
  paletteOpener = open;
}

/** Opens the palette while the inventory layout is mounted; otherwise it does nothing. */
export function openPaletteFromTopBar(): void {
  paletteOpener?.();
}

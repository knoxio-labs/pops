import { INVENTORY_PAGES } from '@pops/inventory/manifest';

/**
 * Shape of one page in `INVENTORY_PAGES`, restated so the flatten below can walk
 * it without importing the SDK's schema types into a test helper.
 */
interface PageNode {
  readonly path: string;
  readonly index?: boolean;
  readonly bundleSlot: string;
  readonly children?: readonly PageNode[];
}

/**
 * Every slot in the page tree, nested tabs included.
 *
 * A top-level-only test would silently skip any nested children, which is the
 * part most likely to drift when a page group gains another route.
 */
export function allPageSlots(pages: readonly PageNode[] = INVENTORY_PAGES): string[] {
  return pages.flatMap((page) => [
    page.bundleSlot,
    ...(page.children === undefined ? [] : allPageSlots(page.children)),
  ]);
}

/** Every page in the tree, flattened, for tests that need more than the slot. */
export function allPages(pages: readonly PageNode[] = INVENTORY_PAGES): PageNode[] {
  return pages.flatMap((page) => [
    page,
    ...(page.children === undefined ? [] : allPages(page.children)),
  ]);
}

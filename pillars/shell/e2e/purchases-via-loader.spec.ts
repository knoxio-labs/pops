/**
 * The purchases pillar, mounted through the shell's runtime loader and styled
 * by its own stylesheet (POPS-4581).
 *
 * The shell's sheet scans the libs and the shell, and no pillar. Each pillar's
 * remote build emits the utilities its own source uses as `<pillar>.css`, and
 * the loader links it before the first page mounts. So a class only purchases
 * uses must reach the page from `purchases.css` and from nowhere else, and a
 * class both sheets carry must compute the same whichever of them applies it.
 *
 * The page is the order-not-found state: one stubbed 404 renders it, and its
 * panel carries `p-10`, which no lib and nothing in the shell uses.
 */
import { expect, test } from './fixtures/pillar-rest-guard';
import { stubShellBoot } from './helpers/pillar-rest';

import type { Locator, Page } from '@playwright/test';

const PURCHASE_GET_URL = /\/purchases-api\/purchases\/[^/?]+$/;
const PILLAR_SHEET = '/purchases-ui/purchases.css';

/** Only purchases uses it; see the file header. */
const PILLAR_ONLY = 'p-10';

interface SharedUtility {
  /** Which element on the page carries it. */
  readonly on: 'panel' | 'title';
  readonly className: string;
  /** The computed property the utility sets. */
  readonly property: string;
}

/** Utilities on the same page that the shell's sheet carries as well. */
const SHARED: readonly SharedUtility[] = [
  { on: 'panel', className: 'rounded-md', property: 'border-top-left-radius' },
  { on: 'panel', className: 'border-dashed', property: 'border-top-style' },
  { on: 'panel', className: 'text-center', property: 'text-align' },
  { on: 'title', className: 'mb-2', property: 'margin-bottom' },
  { on: 'title', className: 'text-base', property: 'font-size' },
  { on: 'title', className: 'font-medium', property: 'font-weight' },
];

/**
 * Every stylesheet in the document with a rule whose selector is exactly
 * `.<className>`, as the sheet's href — or `inline` for a `<style>` element,
 * which is how the dev server serves the shell's own CSS.
 */
async function sheetsRuling(page: Page, className: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const hits: string[] = [];
    const visit = (rules: CSSRuleList, sheet: CSSStyleSheet): void => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && rule.selectorText === selector) {
          hits.push(sheet.href ?? 'inline');
        }
        if (rule instanceof CSSGroupingRule || rule instanceof CSSStyleRule) {
          visit(rule.cssRules, sheet);
        }
      }
    };
    for (const sheet of document.styleSheets) visit(sheet.cssRules, sheet);
    return hits;
  }, `.${className}`);
}

async function disablePillarSheet(page: Page): Promise<void> {
  const toggled = await page.evaluate((href) => {
    let count = 0;
    for (const sheet of document.styleSheets) {
      if (sheet.href?.includes(href) === true) {
        sheet.disabled = true;
        count += 1;
      }
    }
    return count;
  }, PILLAR_SHEET);
  expect(toggled, `exactly one ${PILLAR_SHEET} is linked`).toBe(1);
}

test.describe('purchases — mounted by the runtime loader, styled by its own sheet', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await stubShellBoot(page);
    await page.route(PURCHASE_GET_URL, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await page.goto('/purchases/order-that-is-gone');
    await expect(page.getByText('No such order')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test('a class only the pillar uses is styled, by the pillar sheet alone', async ({ page }) => {
    const panel = page.locator(`.${PILLAR_ONLY}`);
    await expect(panel).toHaveCSS('padding-top', '40px');

    const servedBy = await sheetsRuling(page, PILLAR_ONLY);
    expect(servedBy, `.${PILLAR_ONLY} comes from ${PILLAR_SHEET} and not the shell`).toEqual([
      expect.stringContaining(PILLAR_SHEET),
    ]);

    await disablePillarSheet(page);
    await expect(panel).toHaveCSS('padding-top', '0px');
  });

  test('a utility both sheets carry computes the same under either one', async ({ page }) => {
    const elements: Record<SharedUtility['on'], Locator> = {
      panel: page.locator(`.${PILLAR_ONLY}`),
      title: page.getByText('No such order'),
    };

    for (const { className } of SHARED) {
      const servedBy = await sheetsRuling(page, className);
      expect(servedBy, `.${className} is in the shell sheet and the pillar sheet`).toEqual(
        expect.arrayContaining(['inline', expect.stringContaining(PILLAR_SHEET)])
      );
    }

    const computed = async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      for (const { on, className, property } of SHARED) {
        out[className] = await elements[on].evaluate(
          (node, prop) => getComputedStyle(node).getPropertyValue(prop),
          property
        );
      }
      return out;
    };

    const underBoth = await computed();
    await disablePillarSheet(page);
    const underShellOnly = await computed();

    expect(underShellOnly).toEqual(underBoth);
  });
});

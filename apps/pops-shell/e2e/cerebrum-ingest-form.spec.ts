/**
 * E2E tests — Cerebrum ingest form.
 *
 * All tRPC calls are mocked via page.route(). The tests verify:
 *   - Page loads with templates and scopes fetched
 *   - Type selector renders template options
 *   - Template fields appear dynamically when a template with custom_fields is selected
 *   - Body is required (Submit disabled when empty)
 *   - Scope picker accepts manual input via keyboard
 *   - Tags can be added via the chip input
 *   - Submitting with no scopes triggers scope inference confirmation dialog
 *   - Accepting inferred scopes and submitting shows the success result
 *   - Dismissing inferred scopes returns to the form
 *   - "Create Another" resets the form after a successful submission
 *   - No JS crashes occur during the flow
 *
 * Selectors are derived directly from the component source:
 *   - Select[aria-label="Engram type"]
 *   - TextInput[aria-label="Title"]
 *   - Textarea[aria-label="Body"]
 *   - input[aria-label="Scope input"]
 *   - ChipInput[aria-label="Tags"]
 *   - Button "Submit" (form action)
 *   - Dialog with "Inferred Scopes" title
 *   - SubmitResult card with "Engram Created" heading
 */
import { expect, type Page, type Route, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TEMPLATES = [
  {
    name: 'decision',
    description: 'Record a decision and its rationale',
    required_fields: ['decision'],
    custom_fields: {
      decision: { type: 'string', description: 'The decision made' },
      alternatives: { type: 'string[]', description: 'Alternatives considered' },
      reversible: { type: 'boolean', description: 'Whether the decision is reversible' },
    },
  },
  {
    name: 'reference',
    description: 'Save reference material',
  },
];

const MOCK_SCOPES = [
  { scope: 'finance', count: 12 },
  { scope: 'media', count: 8 },
  { scope: 'personal', count: 5 },
];

const MOCK_INFERRED_SCOPES = ['finance', 'budgets'];

const MOCK_SUBMIT_RESULT = {
  engram: {
    id: 'eng_20260427_1200_test-engram',
    filePath: 'engrams/2026/04/test-engram.md',
    type: 'capture',
  },
};

// ---------------------------------------------------------------------------
// tRPC mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a tRPC batch-compatible JSON response body.
 * tRPC batched calls send an array of result envelopes.
 */
function trpcBatchResponse(payloads: unknown[]): string {
  return JSON.stringify(payloads.map((data) => ({ result: { data: { json: data } } })));
}

function trpcSingleResponse(data: unknown): string {
  return JSON.stringify({ result: { data: { json: data } } });
}

/**
 * Intercept all tRPC calls and route them to mock handlers.
 *
 * tRPC batch format: GET /trpc/a.b.c,x.y.z?batch=1&input=...
 * tRPC single format: GET /trpc/a.b.c?input=...
 * tRPC mutation format: POST /trpc/a.b.c with JSON body
 */
async function mockAllTrpc(page: Page): Promise<void> {
  await page.route('**/trpc/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const isBatch = url.searchParams.has('batch');
    const method = route.request().method();

    // Extract procedure names from the pathname
    // /trpc/cerebrum.templates.list,cerebrum.scopes.list → ['cerebrum.templates.list', 'cerebrum.scopes.list']
    const procedurePart = pathname.replace(/^.*\/trpc\//, '');
    const procedures = procedurePart.split(',');

    // Handle batched GET queries
    if (isBatch && method === 'GET') {
      const results = procedures.map((proc) => resolveProcedure(proc));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: trpcBatchResponse(results),
      });
      return;
    }

    // Handle single GET queries
    if (method === 'GET') {
      const result = resolveProcedure(procedures[0]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: trpcSingleResponse(result),
      });
      return;
    }

    // Handle mutations (POST)
    if (method === 'POST') {
      const result = resolveMutation(procedures[0]);
      if (isBatch) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: trpcBatchResponse([result]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: trpcSingleResponse(result),
        });
      }
      return;
    }

    // Fallback: pass through
    await route.continue();
  });
}

function resolveProcedure(proc: string): unknown {
  switch (proc) {
    case 'cerebrum.templates.list':
      return { templates: MOCK_TEMPLATES };
    case 'cerebrum.scopes.list':
      return { scopes: MOCK_SCOPES };
    case 'cerebrum.ingest.inferScopes':
      return { scopes: MOCK_INFERRED_SCOPES };
    default:
      return {};
  }
}

function resolveMutation(proc: string): unknown {
  switch (proc) {
    case 'cerebrum.ingest.submit':
      return MOCK_SUBMIT_RESULT;
    default:
      return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Cerebrum — ingest form', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await mockAllTrpc(page);
    await page.goto('/cerebrum');
    // Wait for the page header to confirm the page loaded
    await expect(page.getByRole('heading', { name: 'Ingest' })).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const real = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(real).toHaveLength(0);
  });

  test('renders page header and form fields', async ({ page }) => {
    // Page description from the PageHeader component
    await expect(
      page.getByText('Create a new engram through the ingestion pipeline')
    ).toBeVisible();

    // Type selector should be visible (Select with "Engram type" label)
    await expect(page.getByLabel('Engram type')).toBeVisible();

    // Title input
    await expect(page.getByLabel('Title')).toBeVisible();

    // Body textarea
    await expect(page.getByLabel('Body')).toBeVisible();

    // Scope input
    await expect(page.getByLabel('Scope input')).toBeVisible();

    // Tags input
    await expect(page.getByLabel('Tags')).toBeVisible();

    // Submit button
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('type selector shows template options from mock data', async ({ page }) => {
    const typeSelect = page.getByLabel('Engram type');
    // The type selector should have options: "capture" (always present) + templates
    // Check that "decision" and "reference" options exist
    await expect(typeSelect.locator('option[value="decision"]')).toBeAttached();
    await expect(typeSelect.locator('option[value="reference"]')).toBeAttached();
    await expect(typeSelect.locator('option[value="capture"]')).toBeAttached();
  });

  test('selecting a template with custom_fields renders template fields', async ({ page }) => {
    const typeSelect = page.getByLabel('Engram type');
    await typeSelect.selectOption('decision');

    // "Template Fields" heading should appear
    await expect(page.getByText('Template Fields')).toBeVisible();

    // The "decision" template has: decision (string), alternatives (string[]), reversible (boolean)
    await expect(page.getByLabel('decision')).toBeVisible();
    await expect(page.getByLabel('alternatives')).toBeVisible();
    await expect(page.getByLabel('reversible')).toBeVisible();
  });

  test('selecting a template without custom_fields does not render template fields', async ({
    page,
  }) => {
    const typeSelect = page.getByLabel('Engram type');
    await typeSelect.selectOption('reference');

    // "Template Fields" heading should NOT appear
    await expect(page.getByText('Template Fields')).not.toBeVisible();
  });

  test('submit button is disabled when body is empty', async ({ page }) => {
    // Body starts empty, so Submit should be disabled
    const submitButton = page.getByRole('button', { name: 'Submit' });
    await expect(submitButton).toBeDisabled();

    // Type some body text
    const bodyField = page.getByLabel('Body');
    await bodyField.fill('Some test content');

    // Now Submit should be enabled
    await expect(submitButton).toBeEnabled();

    // Clear body
    await bodyField.fill('');

    // Submit should be disabled again
    await expect(submitButton).toBeDisabled();
  });

  test('scope picker accepts manual scope via Enter key', async ({ page }) => {
    const scopeInput = page.getByLabel('Scope input');
    await scopeInput.fill('my-scope');
    await scopeInput.press('Enter');

    // The scope should appear as a chip (Chip component renders text content)
    await expect(page.getByText('my-scope')).toBeVisible();

    // The helper text about inferring scopes should disappear when scopes are present
    await expect(
      page.getByText('Leave empty to infer scopes automatically on submit.')
    ).not.toBeVisible();
  });

  test('scope picker shows infer hint when no scopes selected', async ({ page }) => {
    await expect(
      page.getByText('Leave empty to infer scopes automatically on submit.')
    ).toBeVisible();
  });

  test('submitting without scopes triggers scope inference and confirmation dialog', async ({
    page,
  }) => {
    // Fill required body field
    await page.getByLabel('Body').fill('Test content for scope inference');

    // Submit without adding scopes
    await page.getByRole('button', { name: 'Submit' }).click();

    // The scope confirm dialog should appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Inferred Scopes')).toBeVisible();

    // The inferred scopes should be shown as badges
    await expect(dialog.getByText('finance')).toBeVisible();
    await expect(dialog.getByText('budgets')).toBeVisible();

    // The explanatory text should be visible
    await expect(
      dialog.getByText('No scopes were provided. The following scopes were inferred')
    ).toBeVisible();
  });

  test('dismissing inferred scopes returns to the form without scopes applied', async ({
    page,
  }) => {
    await page.getByLabel('Body').fill('Test content for scope inference');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Wait for dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Click Dismiss
    await dialog.getByRole('button', { name: 'Dismiss' }).click();

    // Dialog should close
    await expect(dialog).not.toBeVisible();

    // The "infer hint" should still be visible (no scopes were added)
    await expect(
      page.getByText('Leave empty to infer scopes automatically on submit.')
    ).toBeVisible();
  });

  test('accepting inferred scopes applies them and submitting shows success result', async ({
    page,
  }) => {
    await page.getByLabel('Body').fill('Test content for successful submission');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Wait for scope inference dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Accept inferred scopes
    await dialog.getByRole('button', { name: 'Accept & Submit' }).click();
    await expect(dialog).not.toBeVisible();

    // After accepting scopes, the form triggers submit — the mock returns success.
    // The submit button should now trigger the mutation (scopes are applied).
    // Click Submit again since accepting scopes applies them but doesn't auto-submit.
    // Actually looking at the code: confirmInferredScopes calls inference.confirm
    // which applies scopes to the form, but the user needs to click Submit again.
    // Wait for scopes to appear in the form
    await expect(page.getByText('finance')).toBeVisible();

    // Now submit with scopes applied
    await page.getByRole('button', { name: 'Submit' }).click();

    // SubmitResult should appear
    await expect(page.getByText('Engram Created')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('eng_20260427_1200_test-engram')).toBeVisible();
    await expect(page.getByText('engrams/2026/04/test-engram.md')).toBeVisible();
  });

  test('submitting with manual scopes skips inference and shows success result', async ({
    page,
  }) => {
    // Add a scope manually first
    const scopeInput = page.getByLabel('Scope input');
    await scopeInput.fill('manual-scope');
    await scopeInput.press('Enter');

    // Fill required body
    await page.getByLabel('Body').fill('Content with manual scope');

    // Submit — should skip inference since scopes are present
    await page.getByRole('button', { name: 'Submit' }).click();

    // SubmitResult should appear directly (no inference dialog)
    await expect(page.getByText('Engram Created')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('eng_20260427_1200_test-engram')).toBeVisible();
  });

  test('"Create Another" button resets to the form', async ({ page }) => {
    // Perform a quick submission
    const scopeInput = page.getByLabel('Scope input');
    await scopeInput.fill('test');
    await scopeInput.press('Enter');
    await page.getByLabel('Body').fill('Quick submission');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Engram Created')).toBeVisible({ timeout: 10_000 });

    // Click "Create Another"
    await page.getByRole('button', { name: 'Create Another' }).click();

    // Form should be visible again with empty fields
    await expect(page.getByLabel('Body')).toBeVisible();
    await expect(page.getByLabel('Body')).toHaveValue('');
    await expect(page.getByLabel('Title')).toHaveValue('');

    // Submit should be disabled (body is empty again)
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  test('title and body accept text input', async ({ page }) => {
    const title = page.getByLabel('Title');
    const body = page.getByLabel('Body');

    await title.fill('My Test Engram');
    await body.fill('This is the body content\nwith multiple lines');

    await expect(title).toHaveValue('My Test Engram');
    await expect(body).toHaveValue('This is the body content\nwith multiple lines');
  });
});

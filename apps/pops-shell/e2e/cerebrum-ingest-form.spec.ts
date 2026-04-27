/**
 * E2E tests — Cerebrum ingest form
 *
 * Exercises the form at `/cerebrum` with all tRPC calls mocked via
 * `page.route()`. The ingestion pipeline involves LLM calls (classification,
 * entity extraction, scope inference) which cannot run in the e2e
 * environment, so every endpoint is stubbed.
 *
 * Tests:
 *   1. Form renders with all expected fields
 *   2. Fills the form and submits — verifies the success banner
 *   3. Scope inference flow — empty scopes trigger confirm dialog
 *   4. Validation — submit with empty body is rejected (disabled button)
 *
 * Mock architecture:
 *   tRPC v11 httpBatchLink batches multiple queries of the same type into a
 *   single HTTP request. The URL path becomes a comma-joined list and the
 *   client expects an array of envelopes when `?batch=1` is present.
 *   A single-procedure mock cannot handle batched requests, so we install one
 *   `/trpc/**` route handler that splits the procedure list, looks up each
 *   payload provider, and emits an array of envelopes matching the order.
 *
 * Crash detection: pageerror + console.error listeners are asserted empty in
 * afterEach so every test enforces the no-crash requirement.
 */
import { expect, test } from '@playwright/test';

import type { Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TEMPLATES = [
  {
    name: 'note',
    description: 'A structured note',
    required_fields: ['title'],
    suggested_sections: ['summary'],
    default_scopes: ['personal'],
    custom_fields: { priority: { type: 'string', description: 'Priority level' } },
  },
  {
    name: 'decision',
    description: 'A decision record',
    required_fields: [],
    suggested_sections: [],
    default_scopes: ['work'],
    custom_fields: {},
  },
];

const MOCK_SCOPES = [
  { scope: 'personal', count: 12 },
  { scope: 'work', count: 8 },
  { scope: 'finance', count: 5 },
];

const MOCK_ENGRAM = {
  id: 'eng_20260427_1234_e2e-test',
  type: 'note',
  scopes: ['personal'],
  tags: ['e2e', 'test'],
  links: [],
  created: '2026-04-27T00:00:00Z',
  modified: '2026-04-27T00:00:00Z',
  source: 'manual',
  status: 'active',
  template: 'note',
  title: 'E2E Test Engram',
  filePath: 'personal/eng_20260427_1234_e2e-test.md',
  contentHash: 'abc123',
  wordCount: 42,
  customFields: {},
};

const MOCK_SUBMIT_RESULT = {
  engram: MOCK_ENGRAM,
  classification: null,
  entities: [],
  scopeInference: { scopes: ['personal'], source: 'explicit', confidence: 1 },
};

const MOCK_INFER_SCOPES_RESULT = {
  scopes: ['personal', 'work'],
  source: 'llm',
  confidence: 0.85,
};

// ---------------------------------------------------------------------------
// tRPC batch-aware mock router
// ---------------------------------------------------------------------------

type PayloadProvider = (input: unknown) => unknown;

function envelope(data: unknown): { result: { data: unknown } } {
  return { result: { data } };
}

function parseBatchInputs(rawInput: string | null): Record<string, unknown> {
  if (!rawInput) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(rawInput));
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function inputAt(inputs: Record<string, unknown>, index: number): unknown {
  const entry = inputs[String(index)];
  if (entry && typeof entry === 'object' && entry !== null && 'json' in entry) {
    return (entry as { json: unknown }).json;
  }
  return entry;
}

/**
 * Build a provider map. Can be extended per-test to override default
 * responses or add new procedures.
 */
function defaultProviders(): Record<string, PayloadProvider> {
  return {
    'cerebrum.templates.list': () => ({ templates: MOCK_TEMPLATES }),
    'cerebrum.scopes.list': () => ({ scopes: MOCK_SCOPES }),
    'cerebrum.ingest.submit': () => MOCK_SUBMIT_RESULT,
    'cerebrum.ingest.inferScopes': () => MOCK_INFER_SCOPES_RESULT,
  };
}

function createTrpcHandler(providers: Record<string, PayloadProvider>) {
  return async function handleTrpcRoute(route: Route): Promise<void> {
    const url = new URL(route.request().url());
    const pathSegment = url.pathname.replace(/^.*\/trpc\//, '');
    const procedures = pathSegment.split(',').filter(Boolean);
    const isBatch = url.searchParams.has('batch');
    const inputs = parseBatchInputs(url.searchParams.get('input'));

    const envelopes = procedures.map((procedure, index) => {
      const provider = providers[procedure];
      if (!provider) {
        return {
          error: {
            json: {
              message: `Unmocked procedure: ${procedure}`,
              code: -32603,
              data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500, path: procedure },
            },
          },
        };
      }
      return envelope(provider(inputAt(inputs, index)));
    });

    const body = isBatch ? envelopes : envelopes[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  };
}

async function setupMocks(page: Page, overrides?: Record<string, PayloadProvider>): Promise<void> {
  const providers = { ...defaultProviders(), ...overrides };
  await page.route('**/trpc/**', createTrpcHandler(providers));
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
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('renders the form with all expected fields', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/cerebrum');

    // Page header
    await expect(page.getByRole('heading', { name: 'Ingest' })).toBeVisible({ timeout: 10_000 });

    // Type selector — a <select> with the aria-label "Engram type"
    const typeSelect = page.getByLabel('Engram type');
    await expect(typeSelect).toBeVisible();
    // Should have the default "capture" option plus mock templates
    await expect(typeSelect.locator('option')).toHaveCount(
      MOCK_TEMPLATES.length + 1 + 1 // +1 capture +1 placeholder "Select type…"
    );

    // Title input
    await expect(page.getByLabel('Title')).toBeVisible();

    // Body textarea
    await expect(page.getByLabel('Body')).toBeVisible();

    // Scope input
    await expect(page.getByLabel('Scope input')).toBeVisible();

    // Tag input
    await expect(page.getByLabel('Tags')).toBeVisible();

    // Submit button
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('fills the form and submits successfully — shows success banner', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/cerebrum');
    await expect(page.getByRole('heading', { name: 'Ingest' })).toBeVisible({ timeout: 10_000 });

    // Select type "note"
    await page.getByLabel('Engram type').selectOption('note');

    // Fill title
    await page.getByLabel('Title').fill('E2E Test Note');

    // Fill body
    await page.getByLabel('Body').fill('This is an e2e test engram body with sufficient content.');

    // Add scope: type "personal" and press Enter
    const scopeInput = page.getByLabel('Scope input');
    await scopeInput.fill('personal');
    await scopeInput.press('Enter');

    // Add tag: type "e2e" and press Enter
    const tagInput = page.getByLabel('Tags');
    await tagInput.fill('e2e');
    await tagInput.press('Enter');

    // Submit
    await page.getByRole('button', { name: 'Submit' }).click();

    // Success banner shows engram ID, type, and path
    await expect(page.getByText('Engram Created')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(MOCK_ENGRAM.id)).toBeVisible();
    await expect(page.getByText(MOCK_ENGRAM.filePath)).toBeVisible();

    // Type badge
    await expect(page.getByText('note').first()).toBeVisible();

    // "Create Another" button should be visible
    await expect(page.getByRole('button', { name: 'Create Another' })).toBeVisible();
  });

  test('scope inference — empty scopes trigger confirm dialog with inferred scopes', async ({
    page,
  }) => {
    // The inferScopes endpoint is a query (GET), so tRPC calls it via query
    // params. The default mock returns ['personal', 'work'].
    await setupMocks(page);
    await page.goto('/cerebrum');
    await expect(page.getByRole('heading', { name: 'Ingest' })).toBeVisible({ timeout: 10_000 });

    // Fill only the body (minimum required field) — leave scopes empty
    await page
      .getByLabel('Body')
      .fill('A note about personal and work topics for scope inference.');

    // Submit without scopes — should trigger scope inference first
    await page.getByRole('button', { name: 'Submit' }).click();

    // The ScopeConfirmDialog should appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Inferred Scopes')).toBeVisible();
    await expect(dialog.getByText('personal')).toBeVisible();
    await expect(dialog.getByText('work')).toBeVisible();
    await expect(dialog.getByText('No scopes were provided')).toBeVisible();

    // Accept inferred scopes → the form submits with them
    await dialog.getByRole('button', { name: 'Accept & Submit' }).click();

    // Dialog closes
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // The submit mutation fires; success banner appears
    await expect(page.getByText('Engram Created')).toBeVisible({ timeout: 10_000 });
  });

  test('scope inference dismiss — dismiss returns to the form without submitting', async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto('/cerebrum');
    await expect(page.getByRole('heading', { name: 'Ingest' })).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('Body').fill('Content that needs scope inference.');

    // Submit without scopes
    await page.getByRole('button', { name: 'Submit' }).click();

    // Scope confirm dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Dismiss — should close the dialog without submitting
    await dialog.getByRole('button', { name: 'Dismiss' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // No success banner — still on the form
    await expect(page.getByText('Engram Created')).not.toBeVisible();
    await expect(page.getByLabel('Body')).toBeVisible();
  });

  test('validation — submit button is disabled when body is empty', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/cerebrum');
    await expect(page.getByRole('heading', { name: 'Ingest' })).toBeVisible({ timeout: 10_000 });

    // Body is empty by default — Submit should be disabled
    const submitBtn = page.getByRole('button', { name: 'Submit' });
    await expect(submitBtn).toBeDisabled();

    // Type something in body → Submit becomes enabled
    await page.getByLabel('Body').fill('Now the body has content');
    await expect(submitBtn).toBeEnabled();

    // Clear body → Submit disabled again
    await page.getByLabel('Body').fill('');
    await expect(submitBtn).toBeDisabled();
  });

  test('template selection shows custom fields', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/cerebrum');
    await expect(page.getByRole('heading', { name: 'Ingest' })).toBeVisible({ timeout: 10_000 });

    // Initially no template fields (type is empty / capture)
    await expect(page.getByText('Template Fields')).not.toBeVisible();

    // Select "note" which has a custom_fields.priority field
    await page.getByLabel('Engram type').selectOption('note');

    // Template fields heading appears
    await expect(page.getByText('Template Fields')).toBeVisible();

    // The "priority" custom field renders
    await expect(page.getByLabel('priority')).toBeVisible();
  });

  test('Create Another resets the form after successful submission', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/cerebrum');
    await expect(page.getByRole('heading', { name: 'Ingest' })).toBeVisible({ timeout: 10_000 });

    // Submit a valid form
    await page.getByLabel('Body').fill('Content for reset test.');
    const scopeInput = page.getByLabel('Scope input');
    await scopeInput.fill('personal');
    await scopeInput.press('Enter');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Success
    await expect(page.getByText('Engram Created')).toBeVisible({ timeout: 10_000 });

    // Click "Create Another"
    await page.getByRole('button', { name: 'Create Another' }).click();

    // Form re-appears with empty fields
    await expect(page.getByText('Engram Created')).not.toBeVisible();
    await expect(page.getByLabel('Body')).toBeVisible();
    await expect(page.getByLabel('Body')).toHaveValue('');
    await expect(page.getByLabel('Title')).toHaveValue('');
  });
});

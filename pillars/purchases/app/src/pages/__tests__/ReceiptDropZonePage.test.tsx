import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAUPurchases from '@pops/locales/en-AU/purchases.json';

const receiptUploadMock = vi.hoisted(() => vi.fn());

/**
 * Mocked at the generated-SDK boundary and no lower, so `unwrap`, the 409
 * classification, the staging fold and the base64 encoding all run for real.
 *
 * `reconcileQueue` is here because a created purchase invalidates the
 * reconcile queue, and that hook's module imports this same barrel.
 */
vi.mock('../../purchases-api/index.js', () => ({
  receiptUpload: (...args: unknown[]) => receiptUploadMock(...args),
  reconcileQueue: vi.fn(),
}));

import { ReceiptDropZonePage } from '../ReceiptDropZonePage';

import type {
  CreatedOutcome,
  ExtractedReceipt,
  GateFailureKind,
  NeedsReviewOutcome,
  PurchaseDetail,
  UnreadableOutcome,
} from '../receipts/types';

function renderPage(): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReceiptDropZonePage />
    </QueryClientProvider>
  );
  return user;
}

/** The drop zone's input is visually hidden and unlabelled, so it is found by type. */
function dropZoneInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('the drop zone rendered no file input');
  return input;
}

function frame(name: string, bytes: string, type = 'image/jpeg'): File {
  return new File([bytes], name, { type });
}

async function submit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: enAUPurchases['receipts.action.submit'] }));
}

const RAW_CATALOG_KEY = /receipts\.[a-zA-Z]/;

/**
 * `aria-label` values a screen reader reads but `document.body.textContent`
 * never includes, since an attribute carries no text node of its own. A key
 * i18next echoes back unresolved (`receipts.parts.moveDown`) is exactly as
 * wrong here as it is in visible copy, and this is the only query that can
 * catch it.
 */
function leakedAriaLabels(): string[] {
  return Array.from(document.body.querySelectorAll('[aria-label]'))
    .map((element) => element.getAttribute('aria-label') ?? '')
    .filter((label) => RAW_CATALOG_KEY.test(label));
}

function sentParts(): { mediaType: string; dataBase64: string }[] {
  const call: unknown = receiptUploadMock.mock.calls.at(-1)?.[0];
  if (
    typeof call !== 'object' ||
    call === null ||
    !('body' in call) ||
    typeof call.body !== 'object' ||
    call.body === null ||
    !('parts' in call.body) ||
    !Array.isArray(call.body.parts)
  ) {
    throw new Error('the upload was called with no parts body');
  }
  return call.body.parts;
}

function purchaseDetail(overrides: Partial<PurchaseDetail['purchase']> = {}): PurchaseDetail {
  return {
    accounting: {
      awaitingImportCents: 0,
      matchedCents: 0,
      netSpendCents: 4120,
      refundedCents: 0,
      residualCents: 4120,
      totalCents: 4120,
    },
    charges: [],
    documents: [],
    items: [lineItem('Sourdough loaf'), lineItem('Oat milk')],
    purchase: {
      checksum: 'sha256-abc',
      createdAt: '2026-08-13T02:00:00.000Z',
      currency: 'AUD',
      discountCents: 0,
      id: 'purchase-77',
      ingestMethod: 'upload',
      merchantEntityId: null,
      merchantEntityName: 'Woolworths',
      orderedAt: '2026-08-12T09:30:00.000Z',
      paymentHint: null,
      rawRef: null,
      settlementMode: 'card',
      shippingCents: 0,
      source: 'receipt',
      sourceOrderId: 'sha256-abc',
      status: 'awaiting_settlement',
      subtotalCents: 4120,
      surchargeCents: 0,
      taxCents: 0,
      totalCents: 4120,
      updatedAt: '2026-08-13T02:00:00.000Z',
      ...overrides,
    },
    shipments: [],
    tags: [],
  };
}

function lineItem(name: string): PurchaseDetail['items'][number] {
  return {
    item: {
      allocatedAdjustmentCents: 0,
      allocatedShippingCents: 0,
      createdAt: '2026-08-13T02:00:00.000Z',
      gstApplicable: null,
      id: `item-${name}`,
      imageUrl: null,
      kind: null,
      lineTotalCents: 2060,
      merchantCategory: null,
      merchantCondition: null,
      name,
      position: 0,
      promotionalPrice: null,
      purchaseId: 'purchase-77',
      quantity: 1,
      refundedCents: 0,
      shipmentId: null,
      sku: null,
      unitPriceCents: 2060,
      url: null,
    },
    landedCostCents: 2060,
    notes: [],
    tags: [],
    units: [],
  };
}

function created(overrides: Partial<CreatedOutcome> = {}): { data: CreatedOutcome } {
  return {
    data: { kind: 'created', alreadyStored: false, purchase: purchaseDetail(), ...overrides },
  };
}

function extracted(overrides: Partial<ExtractedReceipt> = {}): ExtractedReceipt {
  return {
    address: '1 Smith St, Fitzroy',
    currency: 'AUD',
    discounts: [],
    lines: [
      { description: 'Sourdough loaf', amount: '8.50', quantity: 1 },
      { description: 'Tomatoes', amount: '6.20', unitNote: 'per kg' },
    ],
    merchantName: 'Woolworths',
    purchasedAt: '2026-08-12 19:30',
    purchasedOn: '2026-08-12',
    shipping: null,
    surcharges: [],
    tax: '3.74',
    timeZone: 'Australia/Melbourne',
    total: '41.20',
    unreadable: ['the line under the tomatoes'],
    ...overrides,
  };
}

function needsReview(overrides: Partial<NeedsReviewOutcome> = {}): { data: NeedsReviewOutcome } {
  return {
    data: {
      kind: 'needs-review',
      receiptUris: ['pops:purchases/receipt/sha256-aaa'],
      failures: [
        {
          kind: 'sum-mismatch',
          detail: 'lines total 14.70 against a stated 41.20',
          deltaCents: -2650,
        },
      ],
      extracted: extracted(),
      ...overrides,
    },
  };
}

function unreadable(overrides: Partial<UnreadableOutcome> = {}): { data: UnreadableOutcome } {
  return {
    data: {
      kind: 'unreadable',
      receiptUris: ['pops:purchases/receipt/sha256-bbb'],
      reason: 'the photograph is too dark to make out any text',
      ...overrides,
    },
  };
}

beforeEach(() => {
  receiptUploadMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ReceiptDropZonePage — staging what is sent', () => {
  it('sends one chosen photograph as bare base64 under its own media type', async () => {
    receiptUploadMock.mockResolvedValue(created());
    const user = renderPage();

    await user.upload(dropZoneInput(), frame('till.jpg', 'frame-one'));
    expect(await screen.findByText('till.jpg')).toBeVisible();

    await submit(user);

    expect(sentParts()).toEqual([{ mediaType: 'image/jpeg', dataBase64: btoa('frame-one') }]);
  });

  // A supermarket receipt photographed in three frames is one purchase, and
  // the frames are only that purchase in the order they were taken.
  it('sends several frames as one receipt, in the order they are shown', async () => {
    receiptUploadMock.mockResolvedValue(created());
    const user = renderPage();

    await user.upload(dropZoneInput(), [
      frame('top.jpg', 'top'),
      frame('middle.png', 'middle', 'image/png'),
      frame('bottom.pdf', 'bottom', 'application/pdf'),
    ]);
    expect(await screen.findByText('bottom.pdf')).toBeVisible();

    await submit(user);

    expect(sentParts()).toEqual([
      { mediaType: 'image/jpeg', dataBase64: btoa('top') },
      { mediaType: 'image/png', dataBase64: btoa('middle') },
      { mediaType: 'application/pdf', dataBase64: btoa('bottom') },
    ]);
  });

  it('sends the order the reader put the frames in, not the order they arrived', async () => {
    receiptUploadMock.mockResolvedValue(created());
    const user = renderPage();

    await user.upload(dropZoneInput(), [frame('a.jpg', 'first'), frame('b.jpg', 'second')]);
    expect(await screen.findByText('b.jpg')).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: enAUPurchases['receipts.parts.moveUp'].replace('{{name}}', 'b.jpg'),
      })
    );
    await submit(user);

    expect(sentParts().map((one) => one.dataBase64)).toEqual([btoa('second'), btoa('first')]);
  });

  it('drops a part the reader removed', async () => {
    receiptUploadMock.mockResolvedValue(created());
    const user = renderPage();

    await user.upload(dropZoneInput(), [frame('a.jpg', 'keep'), frame('b.jpg', 'drop')]);
    expect(await screen.findByText('b.jpg')).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: enAUPurchases['receipts.parts.remove'].replace('{{name}}', 'b.jpg'),
      })
    );
    await submit(user);

    expect(sentParts()).toHaveLength(1);
    expect(sentParts()[0]?.dataBase64).toBe(btoa('keep'));
  });

  it('sends a pasted body as a base64 text part', async () => {
    receiptUploadMock.mockResolvedValue(created());
    const user = renderPage();

    await user.type(
      screen.getByLabelText(enAUPurchases['receipts.text.label']),
      'Total: 41,20 café'
    );
    await user.click(screen.getByRole('button', { name: enAUPurchases['receipts.text.add'] }));
    expect(await screen.findByText(enAUPurchases['receipts.parts.pasted'])).toBeVisible();

    await submit(user);

    expect(sentParts()).toEqual([
      { mediaType: 'text/plain', dataBase64: 'VG90YWw6IDQxLDIwIGNhZsOp' },
    ]);
  });

  it('refuses to add an empty paste rather than sending an empty part', async () => {
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: enAUPurchases['receipts.text.add'] }));

    expect(screen.getByText(enAUPurchases['receipts.text.empty'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['receipts.parts.empty'])).toBeVisible();
  });

  it('names a file the upload cannot read and never puts it on the wire', async () => {
    const user = renderPage();

    await user.upload(dropZoneInput(), [
      frame('till.heic', 'bytes', 'image/heic'),
      frame('invoice.pdf', 'bytes', 'application/pdf'),
    ]);

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(
        enAUPurchases['receipts.problem.rejected'].replace('{{names}}', 'till.heic')
      )
    ).toBeVisible();
    expect(screen.getByText('invoice.pdf')).toBeVisible();
    expect(screen.queryByText('till.heic')).toBeNull();

    await submit(user);
    expect(sentParts()).toHaveLength(1);
  });

  it('stops at the parts one receipt may have, and says how many were left out', async () => {
    receiptUploadMock.mockResolvedValue(created());
    const user = renderPage();

    await user.upload(
      dropZoneInput(),
      Array.from({ length: 9 }, (_, index) =>
        frame(`frame-${String(index)}.jpg`, `f${String(index)}`)
      )
    );

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(
        enAUPurchases['receipts.problem.tooMany']
          .replace('{{max}}', '8')
          .replace('{{dropped}}', '1')
      )
    ).toBeVisible();

    await submit(user);
    expect(sentParts()).toHaveLength(8);
    expect(sentParts().at(-1)?.dataBase64).toBe(btoa('f7'));
  });

  it('offers nothing to send until something is staged', () => {
    renderPage();

    expect(
      screen.getByRole('button', { name: enAUPurchases['receipts.action.submit'] })
    ).toBeDisabled();
  });

  // A second send of the same parts can only be refused as a duplicate, and a
  // model reading a photograph takes long enough for an impatient second click.
  it('says it is reading, and will not send the same parts again while it does', async () => {
    let answer = (outcome: { data: CreatedOutcome }): void => {
      throw new Error(`the upload was never called, so ${outcome.data.kind} cannot be answered`);
    };
    receiptUploadMock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const user = renderPage();

    await user.upload(dropZoneInput(), frame('till.jpg', 'frame-one'));
    expect(await screen.findByText('till.jpg')).toBeVisible();
    await submit(user);

    expect(await screen.findByText(enAUPurchases['receipts.status.uploading'])).toBeVisible();
    expect(
      screen.getByRole('button', { name: enAUPurchases['receipts.action.submit'] })
    ).toBeDisabled();

    answer(created());

    expect(await screen.findByText(enAUPurchases['receipts.created.title'])).toBeVisible();
    expect(receiptUploadMock).toHaveBeenCalledTimes(1);
  });
});

describe('ReceiptDropZonePage — created', () => {
  async function uploadOne(response: unknown): Promise<ReturnType<typeof userEvent.setup>> {
    receiptUploadMock.mockResolvedValue(response);
    const user = renderPage();
    await user.upload(dropZoneInput(), frame('till.jpg', 'frame-one'));
    expect(await screen.findByText('till.jpg')).toBeVisible();
    await submit(user);
    return user;
  }

  it('reports the purchase it recorded', async () => {
    await uploadOne(created());

    expect(await screen.findByText(enAUPurchases['receipts.created.title'])).toBeVisible();
    expect(screen.getByText('Woolworths')).toBeVisible();
    expect(screen.getByText('$41.20')).toBeVisible();
    expect(screen.getByText('purchase-77')).toBeVisible();
    expect(screen.getByText('2 line items')).toBeVisible();
  });

  it('says nothing about stored bytes when these ones were new', async () => {
    await uploadOne(created());

    expect(await screen.findByText(enAUPurchases['receipts.created.title'])).toBeVisible();
    expect(screen.queryByText(enAUPurchases['receipts.created.alreadyStored'])).toBeNull();
  });

  it('says the bytes were already stored when the store already had them', async () => {
    await uploadOne(created({ alreadyStored: true }));

    expect(await screen.findByText(enAUPurchases['receipts.created.alreadyStored'])).toBeVisible();
  });

  // Re-sending the parts that produced a purchase can only be refused as a
  // duplicate, and leaving them staged invites the next receipt to join them.
  it('clears the staged parts once they have become a purchase', async () => {
    await uploadOne(created());

    expect(await screen.findByText(enAUPurchases['receipts.created.title'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['receipts.parts.empty'])).toBeVisible();
    expect(screen.queryByText('till.jpg')).toBeNull();
  });

  // A duplicate is the other way a receipt is on record. Leaving its parts
  // staged lets the next receipt be appended to one already written — the
  // same hazard the created case clears for, reached by a different answer.
  it('clears the staged parts when the receipt was already recorded', async () => {
    await uploadOne({
      error: { code: 'ALREADY_IMPORTED', message: 'already read as purchase purchase-77' },
    });

    expect(await screen.findByText(enAUPurchases['receipts.duplicate.title'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['receipts.parts.empty'])).toBeVisible();
    expect(screen.queryByText('till.jpg')).toBeNull();
  });

  it('says there is no purchase page to open rather than offering a dead link', async () => {
    await uploadOne(created());

    expect(await screen.findByText(enAUPurchases['receipts.created.noDetailView'])).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('ReceiptDropZonePage — needs review', () => {
  async function uploadOne(response: unknown): Promise<void> {
    receiptUploadMock.mockResolvedValue(response);
    const user = renderPage();
    await user.upload(dropZoneInput(), frame('till.jpg', 'frame-one'));
    expect(await screen.findByText('till.jpg')).toBeVisible();
    await submit(user);
  }

  it('does not read as a recorded purchase', async () => {
    await uploadOne(needsReview());

    expect(await screen.findByText(enAUPurchases['receipts.review.title'])).toBeVisible();
    expect(screen.getByText(enAUPurchases['receipts.review.intro'])).toBeVisible();
    expect(screen.queryByText(enAUPurchases['receipts.created.title'])).toBeNull();
  });

  it('states the delta in the currency the receipt named', async () => {
    await uploadOne(needsReview());

    expect(
      await screen.findByText(
        enAUPurchases['receipts.review.delta'].replace('{{amount}}', '-$26.50')
      )
    ).toBeVisible();
  });

  // A currency the receipt never stated cannot be invented for the delta, so
  // the figure is reported as what it is.
  it('states the delta in bare cents when the receipt named no currency', async () => {
    await uploadOne(needsReview({ extracted: extracted({ currency: null }) }));

    expect(
      await screen.findByText(
        enAUPurchases['receipts.review.deltaCents'].replace('{{cents}}', '-2650')
      )
    ).toBeVisible();
  });

  it("lists every objection in the receipt's own terms", async () => {
    await uploadOne(
      needsReview({
        failures: [
          {
            kind: 'sum-mismatch',
            detail: 'lines total 14.70 against a stated 41.20',
            deltaCents: -2650,
          },
          { kind: 'unreadable-line', detail: 'line 4 is obscured by a fold' },
          { kind: 'damaged', detail: 'the lower third is torn away' },
        ],
      })
    );

    const failures = await screen.findByRole('list', {
      name: enAUPurchases['receipts.review.failuresLabel'],
    });
    expect(
      within(failures).getByText(enAUPurchases['receipts.review.kind.sum-mismatch'])
    ).toBeVisible();
    expect(
      within(failures).getByText(enAUPurchases['receipts.review.kind.unreadable-line'])
    ).toBeVisible();
    expect(within(failures).getByText(enAUPurchases['receipts.review.kind.damaged'])).toBeVisible();
    expect(within(failures).getByText('line 4 is obscured by a fold')).toBeVisible();
    expect(within(failures).getByText('the lower third is torn away')).toBeVisible();
  });

  it('has a headline for every objection the gate can raise', () => {
    // The panel renders `receipts.review.kind.<kind>` and nothing supplies a
    // fallback, so a kind the catalogue does not carry reaches the reviewer
    // as the raw lookup string. The record is typed by the generated union,
    // so a kind added to the contract fails to compile here before it can
    // fail on screen.
    const everyKind: Readonly<Record<GateFailureKind, true>> = {
      'unreadable-total': true,
      'unreadable-line': true,
      'no-lines': true,
      'negative-line': true,
      'sum-mismatch': true,
      'ambiguous-tax': true,
      damaged: true,
    };

    for (const kind of Object.keys(everyKind)) {
      expect(Object.keys(enAUPurchases), kind).toContain(`receipts.review.kind.${kind}`);
    }
  });

  it('renders an ambiguous tax reading as an objection like any other', async () => {
    // It carries no `deltaCents` — the arithmetic agrees under both readings,
    // so there is no discrepancy to put on screen — and the panel must not
    // treat that absence as a reason to render nothing.
    await uploadOne(
      needsReview({
        failures: [
          {
            kind: 'ambiguous-tax',
            detail: 'the components add to 4740c, the stated total, but 995c is added twice',
          },
        ],
      })
    );

    const failures = await screen.findByRole('list', {
      name: enAUPurchases['receipts.review.failuresLabel'],
    });
    expect(
      within(failures).getByText(enAUPurchases['receipts.review.kind.ambiguous-tax'])
    ).toBeVisible();
    expect(within(failures).getByText(/995c is added twice/u)).toBeVisible();
  });

  // The whole point of this outcome: a reader compares the reading against
  // the paper in their hand, so every field the model produced has to be here.
  it('renders the reading so it can be compared against the receipt', async () => {
    await uploadOne(needsReview());

    expect(await screen.findByText(enAUPurchases['receipts.extracted.heading'])).toBeVisible();
    expect(screen.getByText('1 Smith St, Fitzroy')).toBeVisible();
    expect(screen.getByText('41.20')).toBeVisible();
    expect(screen.getByText('2026-08-12 19:30')).toBeVisible();
    expect(screen.getByText('Australia/Melbourne')).toBeVisible();
    expect(screen.getByText('3.74')).toBeVisible();

    const lines = screen.getByRole('list', {
      name: enAUPurchases['receipts.extracted.linesHeading'],
    });
    expect(within(lines).getByText('8.50')).toBeVisible();
    expect(within(lines).getByText('6.20')).toBeVisible();
    expect(within(lines).getByText(/per kg/)).toBeVisible();
    expect(screen.getByText('the line under the tomatoes')).toBeVisible();
  });

  // Asserted per field rather than by counting the marker. The base fixture
  // already leaves three fields unread, so any count-based assertion is
  // satisfied before the nulls below are applied and would pass against a
  // panel that ignored them entirely.
  it('says which readings were missing instead of rendering a blank', async () => {
    await uploadOne(
      needsReview({ extracted: extracted({ merchantName: null, tax: null, purchasedOn: null }) })
    );

    expect(await screen.findByText(enAUPurchases['receipts.extracted.heading'])).toBeVisible();

    const valueFor = (label: string): string | null | undefined =>
      screen.getByText(label).nextElementSibling?.textContent;

    for (const label of ['merchant', 'tax', 'purchasedOn'] as const) {
      expect(valueFor(enAUPurchases[`receipts.extracted.${label}`])).toBe(
        enAUPurchases['receipts.extracted.missing']
      );
    }

    // A field that WAS read still shows its reading, so the marker is not
    // simply being rendered for every field.
    expect(valueFor(enAUPurchases['receipts.extracted.total'])).toBe('41.20');
  });

  it('says a reading with no lines has none', async () => {
    await uploadOne(needsReview({ extracted: extracted({ lines: [] }) }));

    expect(await screen.findByText(enAUPurchases['receipts.extracted.noLines'])).toBeVisible();
  });

  it('keeps the parts staged, because nothing was recorded', async () => {
    await uploadOne(needsReview());

    expect(await screen.findByText(enAUPurchases['receipts.review.title'])).toBeVisible();
    expect(screen.getByText('till.jpg')).toBeVisible();
  });

  it('shows where the upload was stored', async () => {
    await uploadOne(needsReview());

    const stored = await screen.findByRole('list', {
      name: enAUPurchases['receipts.stored.ariaLabel'],
    });
    expect(within(stored).getByText('pops:purchases/receipt/sha256-aaa')).toBeVisible();
  });
});

describe('ReceiptDropZonePage — the other answers', () => {
  async function uploadOne(response: unknown): Promise<void> {
    receiptUploadMock.mockResolvedValue(response);
    const user = renderPage();
    await user.upload(dropZoneInput(), frame('till.jpg', 'frame-one'));
    expect(await screen.findByText('till.jpg')).toBeVisible();
    await submit(user);
  }

  it('says plainly that nothing could be read, and why', async () => {
    await uploadOne(unreadable());

    expect(await screen.findByText(enAUPurchases['receipts.unreadable.title'])).toBeVisible();
    expect(screen.getByText('the photograph is too dark to make out any text')).toBeVisible();
    expect(screen.queryByText(enAUPurchases['receipts.created.title'])).toBeNull();
  });

  // A receipt already in the system is an ordinary mistake, not a failure.
  //
  // Both codes are asserted because they arrive from different places and only
  // one of them is reachable by uploading the same file twice in a row:
  // DUPLICATE_PURCHASE comes from the write rejecting a checksum it already
  // holds, which a second upload reaches only while the first is still in
  // flight. Testing ALREADY_IMPORTED alone left that path rendering the
  // destructive refusal panel for a receipt that had in fact been recorded.
  it.each([
    { code: 'ALREADY_IMPORTED', from: 'the checks before the model call' },
    { code: 'DUPLICATE_PURCHASE', from: 'the write itself, on a concurrent upload' },
  ] as const)(
    'reads a 409 from $from as already recorded rather than as an error',
    async ({ code }) => {
      await uploadOne({
        error: { code, message: 'This upload has already been read as purchase purchase-77' },
      });

      expect(await screen.findByText(enAUPurchases['receipts.duplicate.title'])).toBeVisible();
      expect(
        screen.getByText('This upload has already been read as purchase purchase-77')
      ).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText(enAUPurchases['receipts.refused.title'])).toBeNull();
    }
  );

  it("surfaces a refusal in the server's own words", async () => {
    await uploadOne({
      error: {
        code: 'NOT_THE_STATED_TYPE',
        message: 'The upload is not a valid image/jpeg file',
      },
    });

    expect(await screen.findByText(enAUPurchases['receipts.refused.title'])).toBeVisible();
    expect(screen.getByText('The upload is not a valid image/jpeg file')).toBeVisible();
    expect(screen.queryByText(enAUPurchases['receipts.duplicate.title'])).toBeNull();
  });

  it('surfaces a declined upload when no vision model is configured', async () => {
    await uploadOne({
      error: {
        code: 'VISION_UNAVAILABLE',
        message: 'No vision model is configured; set ANTHROPIC_API_KEY',
      },
    });

    expect(
      await screen.findByText('No vision model is configured; set ANTHROPIC_API_KEY')
    ).toBeVisible();
  });

  // i18next echoes a key it cannot resolve, so a `t()` naming a key the
  // catalog never defined renders `receipts.something` on screen — which
  // asserting against the catalog's own values could never catch.
  //
  // Unanchored on purpose: `textContent` runs adjacent elements together, so a
  // leaked key is routinely preceded by the last character of the field above
  // it and a `\b` would look right and match nothing.
  it.each([
    { label: 'a recorded purchase', response: created(), settles: 'receipts.created.title' },
    { label: 'a reading under review', response: needsReview(), settles: 'receipts.review.title' },
    { label: 'nothing readable', response: unreadable(), settles: 'receipts.unreadable.title' },
    {
      label: 'a duplicate',
      response: { error: { code: 'ALREADY_IMPORTED', message: 'already read as purchase-1' } },
      settles: 'receipts.duplicate.title',
    },
    {
      label: 'a refusal',
      response: { error: { code: 'NOT_THE_STATED_TYPE', message: 'not a valid image/jpeg file' } },
      settles: 'receipts.refused.title',
    },
  ] as const)('never renders a raw catalog key for $label', async ({ response, settles }) => {
    receiptUploadMock.mockResolvedValue(response);
    const user = renderPage();

    // The refused file raises the staging complaint, so that copy is on screen
    // beside the outcome's.
    await user.upload(dropZoneInput(), [
      frame('till.heic', 'bytes', 'image/heic'),
      frame('till.jpg', 'frame-one'),
    ]);
    expect(await screen.findByText('till.jpg')).toBeVisible();
    await submit(user);

    expect(await screen.findByText(enAUPurchases[settles])).toBeVisible();
    expect(document.body.textContent).not.toMatch(RAW_CATALOG_KEY);
    expect(leakedAriaLabels()).toEqual([]);
  });

  // The staged-parts list carries two catalog keys that name no visible text
  // — `ariaLabel` on the `<ol>` itself and `moveDown` on the second button —
  // so `leakedAriaLabels` above is the only guard that would ever catch a
  // typo in either. Asserted by value here as well, so a rename that breaks
  // the catalog lookup fails loudly rather than as a silent key echo.
  it('names the staged-parts list and its move-later control from the catalog', async () => {
    const user = renderPage();

    await user.upload(dropZoneInput(), [frame('a.jpg', 'first'), frame('b.jpg', 'second')]);
    expect(await screen.findByText('b.jpg')).toBeVisible();

    expect(
      screen.getByRole('list', { name: enAUPurchases['receipts.parts.ariaLabel'] })
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: enAUPurchases['receipts.parts.moveDown'].replace('{{name}}', 'a.jpg'),
      })
    ).toBeVisible();
  });
});

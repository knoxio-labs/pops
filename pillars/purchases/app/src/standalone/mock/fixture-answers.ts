import { ORDER, ORDER_ID } from '../fixtures/order';
import { PRODUCT_DICTIONARY } from '../fixtures/product-dictionary';

import type { MockHandler, MockResponse } from '@pops/pillar-sdk/testing/api-mock';

import type {
  ProductRenameResponses,
  ProductUpdateAliasResponses,
  PurchaseAttachDocumentResponses,
  PurchaseCreateInventoryItemResponses,
  PurchaseDecideInventoryProposalResponses,
  PurchasePatchItemResponses,
  ReceiptReadResponses,
  ReconcileLinksResponses,
  SourceUpsertResponses,
} from '../../purchases-api/types.gen';

/**
 * The handlers in `./handlers` that answer from a fixture looked up by the
 * request, rather than with a constant. Each honours the id it is given and
 * answers the contract's 404 for one the fixtures do not hold, the way the
 * detail read does.
 */

function notFound(what: string): MockResponse {
  return { status: 404, body: { code: 'NOT_FOUND', message: `No such ${what}` } };
}

/** The sha256 of {@link RECEIPT_IMAGE}'s bytes, which is what names a stored receipt. */
export const RECEIPT_SHA256 = 'ef1955ae757c8b966c83248350331bd3a30f658ced11f387f8ebf05ab3368629';

/** A stored receipt image: a 1×1 transparent GIF, the smallest one the contract admits. */
export const RECEIPT_IMAGE: ReceiptReadResponses[200] = {
  byteLength: 42,
  dataBase64: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  mediaType: 'image/gif',
  sha256: RECEIPT_SHA256,
};

/** The one configured source, the merchant the order fixture came from. */
export const SOURCE: SourceUpsertResponses[200] = {
  autoLinkPolicy: 'review',
  createdAt: '2026-07-02T10:00:00.000Z',
  descriptorPattern: null,
  id: 'hardware-barn',
  ingestAdapter: null,
  label: 'Hardware Barn',
  settlementWindowDays: 7,
};

const orderLine = (params: Readonly<Record<string, string>>) =>
  params['id'] === ORDER_ID
    ? ORDER.items.find((line) => line.item.id === params['itemId'])
    : undefined;

const unitOf = (params: Readonly<Record<string, string>>) => orderLine(params)?.units[0];

/** `PATCH /purchases/{id}/items/{itemId}`: the order line, as it stands. */
export const patchItem: MockHandler = ({ params }) => {
  const line = orderLine(params);
  if (line === undefined) return notFound('purchase item');
  const body: PurchasePatchItemResponses[200] = line;
  return { body };
};

/** `POST …/inventory-item`: the line's first unit, and the inventory item it points at. */
export const createInventoryItem: MockHandler = ({ params }) => {
  const unit = unitOf(params);
  if (unit === undefined) return notFound('purchase item unit');
  const body: PurchaseCreateInventoryItemResponses[201] = {
    inventoryItemUri: unit.inventoryItemUri ?? 'pops://inventory/item/inv_standalone',
    unit,
  };
  return { status: 201, body };
};

/** `POST …/inventory-proposal`: the line's first unit. */
export const decideInventoryProposal: MockHandler = ({ params }) => {
  const unit = unitOf(params);
  if (unit === undefined) return notFound('purchase item unit');
  const body: PurchaseDecideInventoryProposalResponses[200] = { unit };
  return { body };
};

const [orderDocument] = ORDER.documents;

/** `POST /purchases/{id}/documents`: the order's document. */
export const attachDocument: MockHandler = ({ params }) => {
  if (params['id'] !== ORDER_ID || orderDocument === undefined) return notFound('purchase');
  const body: PurchaseAttachDocumentResponses[201] = { document: orderDocument };
  return { status: 201, body };
};

/** `PATCH /products/{productId}`: the product, as the dictionary holds it. */
export const renameProduct: MockHandler = ({ params }) => {
  const product = PRODUCT_DICTIONARY.products.find((p) => p.id === params['productId']);
  if (product === undefined) return notFound('product');
  const body: ProductRenameResponses[200] = product;
  return { body };
};

/** `PATCH /products/aliases/{aliasId}`: the alias, as the dictionary holds it. */
export const updateAlias: MockHandler = ({ params }) => {
  const alias = PRODUCT_DICTIONARY.products
    .flatMap((product) => product.aliases)
    .find((a) => a.id === params['aliasId']);
  if (alias === undefined) return notFound('alias');
  const body: ProductUpdateAliasResponses[200] = alias;
  return { body };
};

/** `GET /reconcile/links`: no purchases, for the transaction the query names. */
export const reconcileLinks: MockHandler = ({ query }) => {
  const body: ReconcileLinksResponses[200] = {
    purchases: [],
    transactionUri: query.get('transactionUri') ?? '',
  };
  return { body };
};

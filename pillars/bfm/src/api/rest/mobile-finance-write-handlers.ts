/**
 * Handlers for the `/mobile/finance` routes that write a transaction, read
 * its history and reach its attached files.
 *
 * Thin for the reason `mobile-finance-handlers.ts` gives. Finance decides
 * every one of these; a handler only picks which statuses its route declared.
 */
import { decodeHistoryCursor } from '../finance/history-client.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { toFinanceWriteErrorResponse } from './finance-write-error.js';
import { invalidMobileCursorResponse } from './mobile-request-error.js';
import { toReceiptBytesErrorResponse, toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileFinanceClient } from '../finance/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileFinance'];

/** Events per page when the app does not ask. */
const DEFAULT_HISTORY_PAGE_LIMIT = 25;

/** Builds request handlers for routes already protected by mobile device auth. */
export function makeMobileFinanceWriteHandlers(finance: MobileFinanceClient) {
  return {
    createTransaction: async ({ body }: Req['createTransaction']) => {
      const outcome = await finance.createTransaction(body);
      if (!isGatewayOk(outcome)) return toFinanceWriteErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    updateTransaction: async ({ params, body }: Req['updateTransaction']) => {
      const outcome = await finance.updateTransaction(params.id, body);
      if (!isGatewayOk(outcome)) return toFinanceWriteErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    extractTransactionReceipt: async ({ body }: Req['extractTransactionReceipt']) => {
      const outcome = await finance.extractTransactionReceipt(body);
      if (!isGatewayOk(outcome)) return toFinanceWriteErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    attachToTransaction: async ({ params, body }: Req['attachToTransaction']) => {
      const outcome = await finance.attachToTransaction(params.id, body);
      if (!isGatewayOk(outcome)) return toFinanceWriteErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    getTransactionHistory: async ({ params }: Req['getTransactionHistory']) => {
      const outcome = await finance.getTransactionHistory(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    getAccountHistory: async ({ params, query }: Req['getAccountHistory']) => {
      const cursor = query.cursor === undefined ? null : decodeHistoryCursor(query.cursor);
      if (query.cursor !== undefined && cursor === null) {
        return invalidMobileCursorResponse(
          'The cursor is not one this server issued. Start the history again.'
        );
      }
      const outcome = await finance.getAccountHistory({
        accountId: params.id,
        limit: query.limit ?? DEFAULT_HISTORY_PAGE_LIMIT,
        cursor,
      });
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    listTransactionAttachments: async ({ params }: Req['listTransactionAttachments']) => {
      const outcome = await finance.listTransactionAttachments(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    getTransactionAttachment: async ({ params }: Req['getTransactionAttachment']) => {
      const outcome = await finance.getTransactionAttachment(params.id, params.attachmentId);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    getTransactionAttachmentThumbnail: async ({
      params,
    }: Req['getTransactionAttachmentThumbnail']) => {
      const outcome = await finance.getTransactionAttachmentThumbnail(
        params.id,
        params.attachmentId
      );
      if (!isGatewayOk(outcome)) return toReceiptBytesErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },
  };
}

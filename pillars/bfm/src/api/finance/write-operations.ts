/**
 * The half of bfm's finance leg that writes a transaction, reads its history
 * and reaches its attached files. `client.ts` folds it into the one finance
 * client the mobile handlers take.
 */
import {
  attachToTransaction,
  extractTransactionReceipt,
  getTransactionAttachment,
  getTransactionAttachmentThumbnail,
  listTransactionAttachments,
} from './attachments-client.js';
import {
  getAccountHistory,
  getTransactionHistory,
  type AccountHistoryRequest,
} from './history-client.js';
import { createTransaction, updateTransaction } from './write-client.js';

import type {
  MobileAccountHistoryPage,
  MobileAttachToTransactionBody,
  MobileCreateTransactionBody,
  MobileFinanceReceiptExtract,
  MobileFinanceReceiptExtractBody,
  MobileTransactionAttachments,
  MobileTransactionHistory,
  MobileUpdateTransactionBody,
} from '../../contract/mobile-finance-write-schemas.js';
import type { MobileReceiptBytes, MobileTransactionDetail } from '../../contract/rest-schemas.js';
import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';

/** Finance writes, history and attachments available to bfm's device-gated mobile routes. */
export interface MobileFinanceWriteOperations {
  createTransaction(
    body: MobileCreateTransactionBody
  ): Promise<GatewayOutcome<MobileTransactionDetail>>;
  updateTransaction(
    id: string,
    body: MobileUpdateTransactionBody
  ): Promise<GatewayOutcome<MobileTransactionDetail>>;
  getTransactionHistory(id: string): Promise<GatewayOutcome<MobileTransactionHistory>>;
  getAccountHistory(
    request: AccountHistoryRequest
  ): Promise<GatewayOutcome<MobileAccountHistoryPage>>;
  /** Stores the files and suggests an entry. Writes no transaction. */
  extractTransactionReceipt(
    body: MobileFinanceReceiptExtractBody
  ): Promise<GatewayOutcome<MobileFinanceReceiptExtract>>;
  attachToTransaction(
    id: string,
    body: MobileAttachToTransactionBody
  ): Promise<GatewayOutcome<MobileTransactionAttachments>>;
  listTransactionAttachments(id: string): Promise<GatewayOutcome<MobileTransactionAttachments>>;
  getTransactionAttachment(
    id: string,
    attachmentId: string
  ): Promise<GatewayOutcome<MobileReceiptBytes>>;
  getTransactionAttachmentThumbnail(
    id: string,
    attachmentId: string
  ): Promise<GatewayOutcome<MobileReceiptBytes>>;
}

export function createMobileFinanceWriteOperations(
  gateway: PillarGateway
): MobileFinanceWriteOperations {
  return {
    createTransaction: (body) => createTransaction(gateway, body),
    updateTransaction: (id, body) => updateTransaction(gateway, id, body),
    getTransactionHistory: (id) => getTransactionHistory(gateway, id),
    getAccountHistory: (request) => getAccountHistory(gateway, request),
    extractTransactionReceipt: (body) => extractTransactionReceipt(gateway, body),
    attachToTransaction: (id, body) => attachToTransaction(gateway, id, body),
    listTransactionAttachments: (id) => listTransactionAttachments(gateway, id),
    getTransactionAttachment: (id, attachmentId) =>
      getTransactionAttachment(gateway, { id, attachmentId }),
    getTransactionAttachmentThumbnail: (id, attachmentId) =>
      getTransactionAttachmentThumbnail(gateway, { id, attachmentId }),
  };
}

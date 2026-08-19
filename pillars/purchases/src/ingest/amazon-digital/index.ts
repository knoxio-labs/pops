/** Amazon DSAR digital-orders adapter. See the README beside this file. */
export {
  DIGITAL_ORDERS_BUNDLE_PATH,
  DIGITAL_ORDERS_FILENAME,
  DIGITAL_RETURNS_BUNDLE_PATH,
  DIGITAL_RETURNS_FILENAME,
} from './columns.js';
export {
  AMAZON_DIGITAL_SOURCE_ID,
  PROMOTION_OFFSET_TAG,
  parseAmazonDigitalOrders,
  type AmazonDigitalParseResult,
} from './digital-orders.js';
export {
  parseAmazonDigitalReturns,
  type DigitalRefund,
  type DigitalRefundParseResult,
} from './digital-returns.js';

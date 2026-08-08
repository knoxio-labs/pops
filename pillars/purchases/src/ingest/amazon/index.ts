/** Amazon DSAR export adapter. See the README beside this file. */
export { AmazonBundleShapeError, type AmazonAnomaly } from './columns.js';
export {
  AMAZON_SOURCE_ID,
  parseAmazonOrderHistory,
  type AmazonParseResult,
} from './order-history.js';
export {
  REFUND_DETAILS_BUNDLE_PATH,
  REFUND_DETAILS_FILENAME,
  parseAmazonRefundDetails,
  type AmazonRefund,
  type AmazonRefundParseResult,
} from './refunds.js';

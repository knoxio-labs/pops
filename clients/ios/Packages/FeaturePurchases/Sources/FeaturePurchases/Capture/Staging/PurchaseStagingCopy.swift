internal enum PurchaseStagingCopy {
    internal static func title(receiptCount: Int) -> String {
        switch receiptCount {
        case 0: "Receipts"
        case 1: "1 receipt"
        default: "\(receiptCount) receipts"
        }
    }

    internal static func discardTitle(pageCount: Int) -> String {
        pageCount == 1 ? "Discard this page?" : "Discard these \(pageCount) pages?"
    }
}

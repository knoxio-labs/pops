internal enum PurchaseReadingCopy {
    internal static let title = "Reading"
    internal static let cancel = "Cancel"
    internal static let review = "Review"
    internal static let waiting = "Waiting"
    internal static let unreadable = "Unreadable"
    internal static let unnamedMerchant = "Unnamed merchant"

    internal static func subtitle(done: Int, total: Int) -> String {
        done == total ? "All \(total) done" : "\(done) of \(total)"
    }

    internal static func items(_ count: Int) -> String {
        count == 1 ? "1 item" : "\(count) items"
    }

    internal static func merchant(_ name: String?) -> String {
        name ?? unnamedMerchant
    }
}

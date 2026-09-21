import AppCore

/// The home's conditions that ``PurchasesFixtures`` does not already hold.
@MainActor
internal enum PurchasesHomeFixtures {
    /// The purchase a capture has just saved: Tongli, three days old, so it
    /// lands second in Recent rather than on top.
    internal static let justSavedID = "pur-tongli"

    /// The history before that save.
    internal static let beforeSave = PurchasesFixtures.history.filter { $0.id != justSavedID }

    /// The same history with every open purchase answered, so the unmatched
    /// tile has nothing to count and leaves.
    internal static let allMatched: [Purchase] = PurchasesFixtures.history.map { purchase in
        guard purchase.status.isUnsettled else { return purchase }
        return Purchase(
            id: purchase.id,
            merchant: purchase.merchant,
            orderedOn: purchase.orderedOn,
            total: purchase.total,
            itemCount: purchase.itemCount,
            receiptURI: purchase.receiptURI,
            status: .linked)
    }

    /// The five receipts the pillar actually holds today: one month, so
    /// there is no earlier month for the figure to be compared with.
    internal static let today = PurchasesFixtures.all
}

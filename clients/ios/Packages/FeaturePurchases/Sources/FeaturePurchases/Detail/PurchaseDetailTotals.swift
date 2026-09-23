import AppCore

internal enum PurchaseDetailTotals {
    internal struct Row: Hashable {
        internal let label: String
        internal let amount: String
        internal var isTotal = false
    }

    internal static func rows(for detail: PurchaseDetail) -> [Row] {
        let adjustments: [Row] = [
            shown("Tax", detail.tax),
            shown("Delivery", detail.shipping),
            shown("Surcharge", detail.surcharge),
            shown("Discount", detail.discount).map {
                Row(label: $0.label, amount: "−\($0.amount)")
            },
        ].compactMap { $0 }
        guard !adjustments.isEmpty else { return [] }
        return [Row(label: "Subtotal", amount: detail.subtotal.formatted())] + adjustments
            + [Row(label: "Total", amount: detail.purchase.total.formatted(), isTotal: true)]
    }

    private static func shown(_ label: String, _ amount: MoneyAmount) -> Row? {
        amount.minorUnits == 0 ? nil : Row(label: label, amount: amount.formatted())
    }
}

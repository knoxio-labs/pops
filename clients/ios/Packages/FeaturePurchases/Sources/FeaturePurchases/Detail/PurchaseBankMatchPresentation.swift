import AppCore
import Foundation

/// What the bank match section says, worked out apart from how it is drawn.
internal struct PurchaseBankMatchPresentation: Hashable {
    internal struct Row: Identifiable, Hashable {
        internal let id: String
        internal let title: String
        internal let detail: String?
        internal let amount: String
        /// The transaction's own amount, when it is not the amount this match accounts for.
        internal let onStatement: String?
        internal let method: String
        internal let methodSymbol: String
    }

    /// "A$X of A$Y matched", only while some but not all of the purchase is matched.
    internal let matchedOf: String?
    /// What is still unmatched, under the same condition.
    internal let unmatched: String?
    internal let rows: [Row]

    internal init(
        accounting: PurchaseAccounting?,
        charges: [PurchaseCharge],
        locale: Locale = .autoupdatingCurrent,
        day: (Date) -> String = PurchaseDetailCopy.day
    ) {
        let isPartial =
            accounting.map { $0.matched.minorUnits > 0 && $0.unmatched.minorUnits > 0 } ?? false
        matchedOf =
            isPartial ? accounting.map { PurchaseDetailCopy.matchedOf($0, locale: locale) } : nil
        unmatched =
            isPartial
            ? accounting.map { PurchaseDetailCopy.stillUnmatched($0, locale: locale) } : nil
        rows = charges.flatMap(\.matches).map { Self.row($0, locale: locale, day: day) }
    }

    private static func row(
        _ match: PurchaseChargeMatch, locale: Locale, day: (Date) -> String
    ) -> Row {
        let transaction = match.transaction
        let detail = [transaction.map { day($0.date) }, transaction?.accountName]
            .compactMap { $0 }
            .joined(separator: " · ")
        let differs = transaction.map {
            $0.amount.currencyCode != match.amount.currencyCode
                || abs($0.amount.minorUnits) != abs(match.amount.minorUnits)
        }
        return Row(
            id: match.id,
            title: transaction?.description ?? PurchaseDetailCopy.undescribedTransaction,
            detail: detail.isEmpty ? nil : detail,
            amount: match.amount.formatted(locale: locale),
            onStatement: differs == true
                ? transaction.map { PurchaseDetailCopy.onStatement($0.amount, locale: locale) }
                : nil,
            method: PurchaseDetailCopy.method(match.method),
            methodSymbol: PurchaseDetailCopy.methodSymbol(match.method))
    }
}

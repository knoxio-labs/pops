import AppCore
import Foundation

extension PurchaseDetailCopy {
    internal static let bankMatchTitle = "Bank match"
    internal static let undescribedTransaction = "Bank transaction"

    internal static func method(_ method: PurchaseMatchMethod) -> String {
        switch method {
        case .automatic: "Automatic"
        case .confirmed: "Confirmed"
        }
    }

    internal static func methodSymbol(_ method: PurchaseMatchMethod) -> String {
        switch method {
        case .automatic: "sparkles"
        case .confirmed: "checkmark.seal"
        }
    }

    internal static func matchedOf(
        _ accounting: PurchaseAccounting, locale: Locale = .autoupdatingCurrent
    ) -> String {
        "\(accounting.matched.formatted(locale: locale)) of "
            + "\(accounting.total.formatted(locale: locale)) matched"
    }

    internal static func stillUnmatched(
        _ accounting: PurchaseAccounting, locale: Locale = .autoupdatingCurrent
    ) -> String {
        "\(accounting.unmatched.formatted(locale: locale)) still unmatched"
    }

    internal static func onStatement(
        _ transaction: MoneyAmount, locale: Locale = .autoupdatingCurrent
    ) -> String {
        let magnitude = MoneyAmount(
            minorUnits: abs(transaction.minorUnits), currencyCode: transaction.currencyCode)
        return "\(magnitude.formatted(locale: locale)) on the statement"
    }
}

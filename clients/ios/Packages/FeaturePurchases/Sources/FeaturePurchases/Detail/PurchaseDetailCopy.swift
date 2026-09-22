import AppCore
import Foundation

internal enum PurchaseDetailCopy {
    internal static func symbol(for failure: PurchaseDetailFailure) -> String {
        switch failure {
        case .offline: "wifi.slash"
        case .unreachable: "exclamationmark.icloud"
        case .notFound: "doc.questionmark"
        case .unauthorized: "lock"
        case .contractMismatch: "arrow.down.app"
        }
    }

    internal static func title(for failure: PurchaseDetailFailure) -> String {
        switch failure {
        case .offline: "Offline"
        case .unreachable: "Purchases didn't answer"
        case .notFound: "Purchase not found"
        case .unauthorized: "No access to purchases"
        case .contractMismatch: "Update Pops"
        }
    }

    internal static func message(for failure: PurchaseDetailFailure) -> String {
        switch failure {
        case .offline: "It opens once this phone is back online."
        case .unreachable: "Nothing was lost."
        case .notFound: "It may have been deleted."
        case .unauthorized: "This phone's key doesn't include Purchases."
        case .contractMismatch: "This version can't read this purchase."
        }
    }

    internal static func isRetryable(_ failure: PurchaseDetailFailure) -> Bool {
        switch failure {
        case .offline, .unreachable: true
        case .notFound, .unauthorized, .contractMismatch: false
        }
    }

    internal static func refreshNotice(for failure: PurchaseDetailFailure) -> String {
        switch failure {
        case .offline: "Offline, showing the saved copy"
        case .unreachable: "Couldn't refresh"
        case .notFound: "Deleted elsewhere"
        case .unauthorized: "No longer allowed to refresh"
        case .contractMismatch: "Update Pops to refresh"
        }
    }

    internal static func edited(
        _ date: Date,
        locale: Locale = .autoupdatingCurrent,
        timeZone: TimeZone = .autoupdatingCurrent
    ) -> String {
        let style = Date.FormatStyle(
            locale: locale, calendar: locale.calendar, timeZone: timeZone
        )
        .day()
        .month(.abbreviated)
        return "Edited \(date.formatted(style))"
    }

    internal static func receiptLabel(pages: Int) -> String {
        pages == 1 ? "Receipt" : "Receipt, \(pages) pages"
    }

    internal static func day(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).year())
    }

    internal static func foreignCurrency(
        _ amount: MoneyAmount, locale: Locale = .autoupdatingCurrent
    ) -> String? {
        guard let home = locale.currency?.identifier, home != amount.currencyCode else {
            return nil
        }
        return amount.currencyCode
    }

    internal static func printed(_ merchant: MerchantIdentity) -> String? {
        guard case .entity(_, let name, let printed) = merchant,
            printed.compare(name, options: [.caseInsensitive, .diacriticInsensitive])
                != .orderedSame
        else { return nil }
        return printed
    }

    internal static func match(for status: PurchaseSettlement) -> String {
        switch status {
        case .awaitingSettlement: "Awaiting a bank match"
        case .linked: "Matched to the bank"
        case .partial: "Part matched to the bank"
        case .settledCash: "Paid in cash"
        case .ignored: "Left out of matching"
        case .unrecognised(let raw): raw.prefix(1).uppercased() + raw.dropFirst()
        }
    }

    internal static func matchSymbol(for status: PurchaseSettlement) -> String {
        switch status {
        case .awaitingSettlement: "clock"
        case .linked: "checkmark"
        case .partial: "circle.lefthalf.filled"
        case .settledCash: "banknote"
        case .ignored: "minus"
        case .unrecognised: "questionmark"
        }
    }

    @MainActor
    internal static func shareText(_ detail: PurchaseDetail) -> String {
        let purchase = detail.purchase
        let head = [
            PurchasesPresentation.merchant(purchase),
            day(purchase.orderedOn),
            purchase.total.formatted(),
        ]
        let lines = detail.lines.map {
            "\(PurchaseDetailLineText.oneLine($0.name))  \($0.lineTotal.formatted())"
        }
        return (head + (lines.isEmpty ? [] : [""] + lines)).joined(separator: "\n")
    }
}

import Foundation

extension PurchasesHomeFailure {
    internal var symbol: String {
        switch self {
        case .unavailable: "exclamationmark.icloud"
        case .unauthorized: "person.crop.circle.badge.exclamationmark"
        case .contractMismatch: "arrow.down.app"
        case .transport: "wifi.slash"
        case .dependencyNotBound: "powerplug"
        }
    }

    internal var title: String {
        switch self {
        case .unavailable: "Purchases is down"
        case .unauthorized: "Session ended"
        case .contractMismatch: "Update Pops"
        case .transport: "No connection"
        case .dependencyNotBound: "Not connected"
        }
    }

    internal var message: String {
        switch self {
        case .unavailable: "The server didn't answer."
        case .unauthorized: "Pair this phone again to see purchases."
        case .contractMismatch: "This version can't read purchases any more."
        case .transport: "Purchases load when you're back online."
        case .dependencyNotBound: "This build has no purchases service."
        }
    }

    internal var action: PurchasesHomeFailureAction? {
        switch self {
        case .unavailable, .transport: .retry
        case .unauthorized: .pair
        case .contractMismatch, .dependencyNotBound: nil
        }
    }
}

extension PurchasesHomeFailureAction {
    internal var title: String {
        switch self {
        case .retry: "Try again"
        case .pair: "Pair again"
        }
    }
}

@MainActor internal enum PurchasesHomeCopy {
    internal static let emptyHistory = "No purchases"
    internal static let emptyMonth = "No purchases this month"

    internal static func count(_ count: Int, currencies: Int) -> String {
        let noun = count == 1 ? "purchase" : "purchases"
        let currencySuffix = currencies > 1 ? " in \(currencies) currencies" : ""
        return "\(count) \(noun)\(currencySuffix)"
    }

    internal static func deltaLine(_ delta: PurchasesHomeDigest.Delta?) -> String? {
        guard let delta else { return nil }
        return "\(delta.amount.formatted()) \(delta.isUp ? "more" : "less") than "
            + PurchasesPresentation.shortMonth(delta.against)
    }

    internal static func refreshFailure(_ time: String) -> String {
        "Not updated · \(time)"
    }

    internal static func time(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}

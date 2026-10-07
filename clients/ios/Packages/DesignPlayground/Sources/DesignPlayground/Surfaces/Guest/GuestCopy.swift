import AppCore

/// Every sentence a guest screen prints, in one place so the wording can be
/// read, and approved, as a set.
internal enum GuestCopy {
    internal static let viewOnly = "View only"
    internal static let personLedger = "Shared ledger"
    internal static let balance = "Balance"
    internal static let entries = "Entries"
    internal static let noEntries = "No entries yet."
    internal static let receipts = "Receipts"
    internal static let noReceipts = "No receipts attached."

    internal static let noAccountsTitle = "Nothing is shared with you yet"
    internal static let offline = "Offline. Showing what was last loaded."
    internal static let accountRevoked = "This account is no longer shared with you."
    internal static let backToAccounts = "Back to accounts"

    internal static func sharedBy(_ owner: String) -> String { "Shared by \(owner)" }
    internal static func youOwe(_ owner: String) -> String { "You owe \(owner)" }
    internal static func owesYou(_ owner: String) -> String { "\(owner) owes you" }
    internal static func settled(_ owner: String) -> String { "Settled up with \(owner)" }

    internal static func noAccounts(email: String) -> String {
        "No accounts are shared with \(email). Ask the person who invited you to share one."
    }

    internal static func label(_ kind: GuestEntryKind, owner: String) -> String {
        switch kind {
        case .paidForOwner: "I paid for \(owner)"
        case .ownerPaidForMe: "\(owner) paid for me"
        case .repaidOwner: "I paid \(owner) back"
        case .ownerRepaidMe: "\(owner) paid me back"
        case .purchase: "Purchase"
        case .refund: "Refund"
        case .income: "Income"
        case .transferOut: "Transfer out"
        case .transferIn: "Transfer in"
        default: unlistedType(kind.type)
        }
    }

    internal static func unlistedType(_ type: TransactionType) -> String {
        type.rawValue.prefix(1).uppercased() + type.rawValue.dropFirst()
    }

    internal static func pageCount(_ count: Int) -> String {
        count == 1 ? "1 page" : "\(count) pages"
    }
}

/// The handles this feature's screens offer to something driving them from
/// outside the process. Same division as `TransactionsAccessibility`.
internal enum AccountsAccessibility {
    internal static let list = "accounts-list"
    internal static let detail = "account-detail"
    internal static let picker = "account-picker"

    internal static func row(_ accountID: String) -> String {
        "account-row-\(accountID)"
    }

    internal static func pickerRow(_ accountID: String) -> String {
        "account-picker-row-\(accountID)"
    }
}

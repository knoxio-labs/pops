/// The handles this feature's screens offer to something driving them from
/// outside the process.
///
/// The same division as ``PairingAccessibility`` in the pairing module: the
/// labels on these views are what VoiceOver speaks and they already read as
/// sentences; these are stable names that survive a copy edit.
/// `clients/ios/.maestro/pairing-to-transaction-detail.yaml` keys on them.
///
/// ``row(_:)`` carries the transaction's own id rather than a position, so a
/// flow names the row it means instead of the third one down — which would
/// pass against the wrong record the moment the seed grows a fourth row.
internal enum TransactionsAccessibility {
    internal static let list = "transactions-list"
    internal static let detail = "transaction-detail"

    internal static func row(_ transactionID: String) -> String {
        "transaction-row-\(transactionID)"
    }
}

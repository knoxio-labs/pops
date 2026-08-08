/// A transaction's semantic type, mirroring the finance pillar's vocabulary.
///
/// Deliberately not an `enum`: this app is distributed rather than deployed, so
/// a build already on a phone meets contract versions written after it. An
/// enum would fail to decode a type added later; a raw-value wrapper carries it
/// through and lets a screen fall back to showing it plainly.
public struct TransactionType: RawRepresentable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public static let purchase = TransactionType(rawValue: "purchase")
    public static let transfer = TransactionType(rawValue: "transfer")
    public static let income = TransactionType(rawValue: "income")
    public static let refund = TransactionType(rawValue: "refund")
    public static let reversal = TransactionType(rawValue: "reversal")
    public static let loan = TransactionType(rawValue: "loan")
    public static let rebate = TransactionType(rawValue: "rebate")
    public static let tax = TransactionType(rawValue: "tax")
}

import Foundation

/// One row of the transactions list, in the app's own vocabulary rather than
/// the wire's. A feature is written against this type and never against a
/// generated one, which is what lets the contract move without a feature
/// noticing.
public struct Transaction: Hashable, Sendable, Identifiable {
    public let id: String
    public let description: String
    public let amount: MoneyAmount
    /// The Gregorian calendar day supplied by finance, without a time-zone anchor.
    public let date: CalendarDay
    public let type: TransactionType
    public let entityName: String?
    public let tags: [String]

    /// Creates a transaction row from values mapped by an AppCore repository.
    ///
    /// - Parameters:
    ///   - id: Stable transaction identifier.
    ///   - description: The transaction description supplied by finance.
    ///   - amount: The amount and currency supplied by finance.
    ///   - date: The Gregorian calendar day supplied by finance.
    ///   - type: The transaction type supplied by finance.
    ///   - entityName: The optional entity associated with the transaction.
    ///   - tags: The tags supplied by finance.
    public init(
        id: String,
        description: String,
        amount: MoneyAmount,
        date: CalendarDay,
        type: TransactionType,
        entityName: String?,
        tags: [String]
    ) {
        self.id = id
        self.description = description
        self.amount = amount
        self.date = date
        self.type = type
        self.entityName = entityName
        self.tags = tags
    }
}

import Foundation

/// One row of the transactions list, in the app's own vocabulary rather than
/// the wire's. A feature is written against this type and never against a
/// generated one, which is what lets the contract move without a feature
/// noticing.
public struct Transaction: Hashable, Sendable, Identifiable {
    public let id: String
    public let description: String
    public let amount: MoneyAmount
    public let date: Date
    public let type: TransactionType
    public let entityName: String?
    public let tags: [String]

    public init(
        id: String,
        description: String,
        amount: MoneyAmount,
        date: Date,
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

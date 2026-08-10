import Foundation

/// The fuller record behind one list row.
///
/// A separate type from ``Transaction`` rather than optional fields bolted onto
/// it, because the two come off different endpoints and answer different
/// questions. The list row is what the BFM sends for a screenful of rows on
/// cellular; this is what it sends when somebody asked about one of them.
/// Merging them would make every field the list does not carry optional, and a
/// screen would then have no way to tell "finance recorded no notes" from "this
/// value came off a list that never carries notes".
public struct TransactionDetail: Hashable, Sendable, Identifiable {
    public let id: String
    public let description: String
    public let amount: MoneyAmount
    public let date: Date
    public let type: TransactionType
    /// The account finance recorded it against.
    public let account: String
    /// Display name of the counterparty, or `nil` when finance has none.
    public let entityName: String?
    /// The counterparty's identity, as distinct from its label. Carried and not
    /// drawn: the entity is what a correction operates on and the name is only
    /// how it reads, so a screen that ever links out of here needs the id and
    /// re-fetching the record to get it would be a round trip for a field the
    /// app already had.
    public let entityId: String?
    public let tags: [String]
    public let location: String?
    public let country: String?
    public let notes: String?
    /// The other leg of a matched transfer, when finance paired one. Carried
    /// and not drawn for the same reason as ``entityId`` — there is no screen
    /// to link it to yet.
    public let relatedTransactionId: String?
    /// Finance's last write to this row.
    public let lastEditedAt: Date

    public init(
        id: String,
        description: String,
        amount: MoneyAmount,
        date: Date,
        type: TransactionType,
        account: String,
        entityName: String?,
        entityId: String?,
        tags: [String],
        location: String?,
        country: String?,
        notes: String?,
        relatedTransactionId: String?,
        lastEditedAt: Date
    ) {
        self.id = id
        self.description = description
        self.amount = amount
        self.date = date
        self.type = type
        self.account = account
        self.entityName = entityName
        self.entityId = entityId
        self.tags = tags
        self.location = location
        self.country = country
        self.notes = notes
        self.relatedTransactionId = relatedTransactionId
        self.lastEditedAt = lastEditedAt
    }
}

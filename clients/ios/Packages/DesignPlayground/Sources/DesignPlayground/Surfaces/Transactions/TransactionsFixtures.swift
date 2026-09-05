import AppCore
import Foundation

/// Literal transactions for ``TransactionsSurfaces``, shaped the way
/// `FeatureTransactions/TransactionsPreviews.swift` shapes its own: a spread
/// of ``TransactionType`` values, a row with no entity, and a row with no
/// tags, because a fixture set that is all purchases with an entity and one
/// tag never exercises what a row looks like without them.
extension Fixtures {
    public static let transactionRows: [Transaction] = [
        Transaction(
            id: "txn-flat-white",
            description: "Flat white",
            amount: money(-540),
            date: Date(timeIntervalSince1970: 1_786_000_000),
            type: .purchase,
            entityName: "Sample Coffee",
            tags: ["coffee"]
        ),
        Transaction(
            id: "txn-woolworths",
            description: "Woolworths Metro Surry Hills",
            amount: money(-8_412),
            date: Date(timeIntervalSince1970: 1_785_950_000),
            type: .purchase,
            entityName: "Woolworths",
            tags: ["groceries"]
        ),
        Transaction(
            id: "txn-rent",
            description: "Rent",
            amount: money(-124_000),
            date: Date(timeIntervalSince1970: 1_785_800_000),
            type: .transfer,
            entityName: "Landlord",
            tags: ["housing", "recurring"]
        ),
        Transaction(
            id: "txn-salary",
            description: "Salary",
            amount: money(420_000),
            date: Date(timeIntervalSince1970: 1_785_600_000),
            type: .income,
            entityName: "Employer",
            tags: []
        ),
        Transaction(
            id: "txn-opal",
            description: "Opal top up",
            amount: money(-4_000),
            date: Date(timeIntervalSince1970: 1_785_500_000),
            type: .purchase,
            entityName: nil,
            tags: ["transport", "recurring"]
        ),
        Transaction(
            id: "txn-kmart-refund",
            description: "Kmart Broadway",
            amount: money(2_100),
            date: Date(timeIntervalSince1970: 1_785_400_000),
            type: .refund,
            entityName: "Kmart",
            tags: ["home"]
        ),
        Transaction(
            id: "txn-council-rates",
            description: "Council rates",
            amount: money(-46_150),
            date: Date(timeIntervalSince1970: 1_785_300_000),
            type: .tax,
            entityName: "City of Sydney",
            tags: ["housing"]
        ),
    ]

    /// The fuller record behind ``transactionRows``' first row, as a fetch
    /// returns it after the tap.
    public static let transactionDetail = TransactionDetail(
        id: transactionRows[0].id,
        description: transactionRows[0].description,
        amount: transactionRows[0].amount,
        date: transactionRows[0].date,
        type: transactionRows[0].type,
        account: "Everyday",
        entityName: transactionRows[0].entityName,
        entityId: "entity-sample-coffee",
        tags: transactionRows[0].tags,
        location: "Surry Hills",
        country: "Australia",
        notes: "Before the standup.",
        relatedTransactionId: nil,
        lastEditedAt: Date(timeIntervalSince1970: 1_786_100_000)
    )
}

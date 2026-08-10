import AppCore
import Foundation

extension URL {
    /// `.invalid` is reserved by RFC 6761, so nothing here can accidentally
    /// reach a real host.
    public static let fakeBFM = URL(string: "https://bfm.invalid")!
}

extension PairedDevice {
    public static func fake(id: String = "device-fake", baseURL: URL = .fakeBFM) -> PairedDevice {
        PairedDevice(id: id, baseURL: baseURL)
    }
}

extension PairingRequest {
    public static func fake(
        baseURL: URL = .fakeBFM,
        code: String = "ABC123",
        deviceName: String = "Fake iPhone",
        deviceModel: String = "iPhone17,1"
    ) -> PairingRequest {
        PairingRequest(
            baseURL: baseURL,
            code: code,
            deviceName: deviceName,
            deviceModel: deviceModel
        )
    }
}

extension Transaction {
    /// A row whose fields a test can ignore. Every value is overridable, so a
    /// test names only the field it is actually about.
    public static func fake(
        id: String = "txn-1",
        description: String = "Fake transaction",
        amount: MoneyAmount = MoneyAmount(minorUnits: 1999, currencyCode: "AUD"),
        date: Date = Date(timeIntervalSince1970: 0),
        type: TransactionType = .purchase,
        entityName: String? = nil,
        tags: [String] = []
    ) -> Transaction {
        Transaction(
            id: id,
            description: description,
            amount: amount,
            date: date,
            type: type,
            entityName: entityName,
            tags: tags
        )
    }

    /// `count` rows with distinct ids, for paging.
    public static func fakes(count: Int) -> [Transaction] {
        (0..<count).map { Transaction.fake(id: "txn-\($0)", description: "Fake transaction \($0)") }
    }
}

extension TransactionDetail {
    /// The fuller record, with every field overridable so a test names only the
    /// one it is about.
    ///
    /// The optional fields default to values rather than to `nil`: a screen
    /// that drops empty fields renders a record of all-nils identically to one
    /// it failed to read, and a fixture whose default is the degenerate case
    /// makes that the shape every test accidentally asserts against.
    public static func fake(
        id: String = "txn-1",
        description: String = "Fake transaction",
        amount: MoneyAmount = MoneyAmount(minorUnits: 1999, currencyCode: "AUD"),
        date: Date = Date(timeIntervalSince1970: 0),
        type: TransactionType = .purchase,
        account: String = "Everyday",
        entityName: String? = "Fake Entity",
        entityId: String? = "entity-1",
        tags: [String] = ["fake"],
        location: String? = "Sydney",
        country: String? = "Australia",
        notes: String? = "Fake notes",
        relatedTransactionId: String? = nil,
        lastEditedAt: Date = Date(timeIntervalSince1970: 86_400)
    ) -> TransactionDetail {
        TransactionDetail(
            id: id,
            description: description,
            amount: amount,
            date: date,
            type: type,
            account: account,
            entityName: entityName,
            entityId: entityId,
            tags: tags,
            location: location,
            country: country,
            notes: notes,
            relatedTransactionId: relatedTransactionId,
            lastEditedAt: lastEditedAt
        )
    }
}

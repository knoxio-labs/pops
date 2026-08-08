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
    public static func fake(baseURL: URL = .fakeBFM, code: String = "ABC123") -> PairingRequest {
        PairingRequest(baseURL: baseURL, code: code)
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

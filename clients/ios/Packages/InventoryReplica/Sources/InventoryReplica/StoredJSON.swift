import AppCore
import Foundation

// The JSON shapes the replica keeps in `TEXT` columns. `AppCore`'s types are
// deliberately not `Codable` (their wire mapping is `BFMClient`'s concern), so
// each one that has to survive a round trip through a column has a storage
// twin here and nowhere else.

internal enum StoredJSON {
    static func encode<Value: Encodable>(_ value: Value) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let text = String(bytes: try encoder.encode(value), encoding: .utf8) else {
            throw InventoryReplicaError.corruptValue("JSON that is not UTF-8")
        }
        return text
    }

    static func decode<Value: Decodable>(_ type: Value.Type, from text: String) throws -> Value {
        try JSONDecoder().decode(type, from: Data(text.utf8))
    }
}

/// `InventoryFieldValue`'s storage twin. The synthesised `Codable` of an enum
/// with associated values keys each value by its case, so the kind and the
/// payload cannot disagree in a stored row.
internal enum StoredFieldValue: Codable, Equatable {
    case text(String)
    case choice(String)
    case flag(Bool)
    case measurement(value: Double, unit: String)
    case range(low: Double, high: Double, unit: String)
    case link(String)
    case placement(StoredPlacement)
    case previousPlacement(StoredPreviousPlacement)

    init(_ value: InventoryFieldValue) {
        switch value {
        case .text(let text): self = .text(text)
        case .choice(let text): self = .choice(text)
        case .flag(let flag): self = .flag(flag)
        case .measurement(let measurement):
            self = .measurement(value: measurement.value, unit: measurement.unit)
        case .range(let range): self = .range(low: range.low, high: range.high, unit: range.unit)
        case .link(let text): self = .link(text)
        case .placement(let placement): self = .placement(StoredPlacement(placement))
        case .previousPlacement(let previous):
            self = .previousPlacement(StoredPreviousPlacement(previous))
        }
    }

    var domainValue: InventoryFieldValue {
        switch self {
        case .text(let text): .text(text)
        case .choice(let text): .choice(text)
        case .flag(let flag): .flag(flag)
        case .measurement(let value, let unit):
            .measurement(InventoryMeasurement(value: value, unit: unit))
        case .range(let low, let high, let unit):
            .range(InventoryRange(low: low, high: high, unit: unit))
        case .link(let text): .link(text)
        case .placement(let placement): .placement(placement.domainValue)
        case .previousPlacement(let previous): .previousPlacement(previous.domainValue)
        }
    }

    static func encode(_ fields: [String: InventoryFieldValue]) throws -> String {
        try StoredJSON.encode(fields.mapValues(StoredFieldValue.init))
    }

    static func decodeFields(_ text: String) throws -> [String: InventoryFieldValue] {
        try StoredJSON.decode([String: StoredFieldValue].self, from: text).mapValues(\.domainValue)
    }
}

internal struct StoredExternalIdentifier: Codable, Equatable {
    let kind: String
    let value: String
}

extension StoredExternalIdentifier {
    init(_ identifier: InventoryExternalIdentifier) {
        self.init(kind: identifier.kind, value: identifier.value)
    }

    var domainValue: InventoryExternalIdentifier {
        InventoryExternalIdentifier(kind: kind, value: value)
    }
}

internal struct StoredPhoto: Codable, Equatable {
    let sha256: String
    let caption: String?
}

internal struct StoredProvenance: Codable, Equatable {
    let merchant: String?
    let priceMinorUnits: Int?
    let priceCurrency: String?
    let purchasedOn: Double?
    let warrantyExpires: Double?
    let transactionUri: String?

    init(_ provenance: InventoryProvenance) {
        merchant = provenance.merchant
        priceMinorUnits = provenance.price?.minorUnits
        priceCurrency = provenance.price?.currencyCode
        purchasedOn = provenance.purchasedOn?.timeIntervalSinceReferenceDate
        warrantyExpires = provenance.warrantyExpires?.timeIntervalSinceReferenceDate
        transactionUri = provenance.transactionUri
    }

    var domainValue: InventoryProvenance {
        let price = zip(priceMinorUnits, priceCurrency).map {
            MoneyAmount(minorUnits: $0, currencyCode: $1)
        }
        return InventoryProvenance(
            merchant: merchant, price: price,
            purchasedOn: purchasedOn.map(Date.init(timeIntervalSinceReferenceDate:)),
            warrantyExpires: warrantyExpires.map(Date.init(timeIntervalSinceReferenceDate:)),
            transactionUri: transactionUri)
    }
}

private func zip<First, Second>(_ first: First?, _ second: Second?) -> (First, Second)? {
    guard let first, let second else { return nil }
    return (first, second)
}

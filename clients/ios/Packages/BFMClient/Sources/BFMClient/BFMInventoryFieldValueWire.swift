import AppCore
import OpenAPIRuntime

/// Decoding and encoding a protocol-1 custom field's raw wire value, by JSON
/// shape alone.
///
/// `text`, `choice` and `link` all serialise as a bare JSON string and are
/// not distinguishable without the catalogue's own field-kind declaration for
/// that key, which nothing on this call path is handed. Every bare string
/// therefore decodes as `.text`; a caller that needs `.choice` or `.link`
/// specifically has to re-derive it from the catalogue by key, which is not
/// this transport's job (`InventorySyncTransport.fetchCatalogue` is a
/// separate call).
internal enum BFMInventoryFieldValueWire {
    internal static func decode(_ container: OpenAPIValueContainer) -> InventoryFieldValue? {
        switch container.value {
        case let text as String: .text(text)
        case let flag as Bool: .flag(flag)
        case is [(any Sendable)?], is [String: (any Sendable)?]:
            decodeStructured(container.value)
        default: nil
        }
    }

    private static func decodeStructured(_ value: (any Sendable)?) -> InventoryFieldValue? {
        guard let dict = value as? [String: (any Sendable)?] else { return nil }
        if let measurement = measurement(from: dict) { return .measurement(measurement) }
        if let range = range(from: dict) { return .range(range) }
        return nil
    }

    private static func measurement(from dict: [String: (any Sendable)?]) -> InventoryMeasurement? {
        guard dict.count == 2, let unit = string(dict["unit"]), let value = number(dict["value"])
        else { return nil }
        return InventoryMeasurement(value: value, unit: unit)
    }

    private static func range(from dict: [String: (any Sendable)?]) -> InventoryRange? {
        guard dict.count == 3, let unit = string(dict["unit"]), let low = number(dict["low"]),
            let high = number(dict["high"])
        else { return nil }
        return InventoryRange(low: low, high: high, unit: unit)
    }

    private static func string(_ value: (any Sendable)??) -> String? {
        value.flatMap { $0 } as? String
    }

    private static func number(_ value: (any Sendable)??) -> Double? {
        switch value.flatMap({ $0 }) {
        case let value as Double: value
        case let value as Int: Double(value)
        default: nil
        }
    }

    /// The inverse of `decode(_:)`, for a field patch this build is sending.
    internal static func encode(_ value: InventoryFieldValue) throws -> OpenAPIValueContainer {
        switch value {
        case .text(let text), .choice(let text), .link(let text):
            try OpenAPIValueContainer(unvalidatedValue: text)
        case .flag(let flag):
            try OpenAPIValueContainer(unvalidatedValue: flag)
        case .measurement(let measurement):
            try OpenAPIValueContainer(
                unvalidatedValue: [
                    "value": measurement.value, "unit": measurement.unit,
                ] as [String: (any Sendable)?])
        case .range(let range):
            try OpenAPIValueContainer(
                unvalidatedValue: [
                    "low": range.low, "high": range.high, "unit": range.unit,
                ] as [String: (any Sendable)?])
        case .placement, .previousPlacement:
            // Never a custom field's own value (`InventoryFieldValue`'s own
            // doc comment): a command patches a type's declared fields, never
            // an item's placement, which has its own op (`item.move`).
            throw RepositoryError.contractMismatch
        }
    }
}

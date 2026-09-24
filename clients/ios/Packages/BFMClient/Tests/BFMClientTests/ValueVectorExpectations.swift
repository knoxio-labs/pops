import AppCore
import Foundation

/// What a vector's wire value must read back as, built with the domain's own
/// canonical constructors from the JSON the producer wrote. It never goes
/// through the transport or the replica, so it is an independent oracle for
/// what those decode.
internal enum ValueVectorExpectations {
    private typealias File = ValueVectorFile

    internal static func kind(_ vector: [String: Any]) throws -> InventoryPrimitiveKind {
        try File.require(InventoryPrimitiveKind(rawValue: vector["kind"] as? String ?? ""), "kind")
    }

    /// One wire value as `kind`. A reference carries the target state the
    /// producer resolved, which the replica must resolve to on its own rows.
    internal static func primitive(_ json: Any, kind: InventoryPrimitiveKind) throws
        -> InventoryPrimitiveValue
    {
        switch kind {
        case .shortText, .longText: return .string(try text(json))
        case .integer:
            return .integer(try InventoryInteger(try File.require(json as? Int64, "an integer")))
        case .decimal: return .decimal(try InventoryDecimal(try text(json)))
        case .boolean: return .boolean(try File.require(json as? Bool, "a boolean"))
        case .enumeration:
            return .enumeration(optionId: try text(File.object(json)["optionId"]))
        case .measurement:
            let object = try File.object(json)
            return .measurement(
                amount: try InventoryDecimal(try text(object["amount"])),
                unit: try text(object["unit"]))
        case .date: return .date(try InventoryCanonicalDate(try text(json)))
        case .dateTime: return .dateTime(try InventoryCanonicalDateTime(try text(json)))
        case .url: return .url(try InventoryCanonicalURL(try text(json)))
        case .reference: return try reference(json)
        }
    }

    internal static func primitives(_ values: Any?, kind: InventoryPrimitiveKind) throws
        -> [InventoryPrimitiveValue]
    {
        try File.require(values as? [Any], "values").map { try primitive($0, kind: kind) }
    }

    /// A computed entry's evaluation as the replica must hold it.
    internal static func evaluation(_ computed: [String: Any], kind: InventoryPrimitiveKind) throws
        -> InventoryComputedEvaluation
    {
        switch computed["state"] as? String {
        case "ok":
            return .ok(try single(computed, kind: kind))
        case "overridden":
            let revision = try File.object(computed["override"])["catalogueRevision"] as? Int
            return .overridden(
                try single(computed, kind: kind),
                overrideCatalogueRevision: try File.require(revision, "override revision"))
        case "unavailable":
            return .unavailable(
                reason: try text(computed["reason"]),
                failedFieldId: try text(computed["failedFieldId"]))
        default:
            throw File.Missing(description: "a closed computed state")
        }
    }

    internal static func missingInputs(_ computed: [String: Any]) throws
        -> [InventoryExpressionMissingInput]
    {
        try (computed["missingInputs"] as? [Any] ?? []).map {
            let input = try File.object($0)
            return InventoryExpressionMissingInput(
                reason: try text(input["reason"]), fieldId: try text(input["fieldId"]),
                itemId: try text(input["itemId"]))
        }
    }

    private static func single(_ computed: [String: Any], kind: InventoryPrimitiveKind) throws
        -> InventoryPrimitiveValue
    {
        let values = try File.require(computed["values"] as? [Any], "values")
        return try primitive(try File.require(values.first, "a value"), kind: kind)
    }

    private static func text(_ value: Any?) throws -> String {
        try File.require(value as? String, "a string")
    }

    private static func reference(_ json: Any) throws -> InventoryPrimitiveValue {
        let object = try File.object(json)
        let targetKind = try File.require(
            InventoryReferenceTargetKind(rawValue: try text(object["targetKind"])), "target kind")
        let state = try (object["targetState"] as? String).map {
            try File.require(InventoryReferenceState(rawValue: $0), "target state")
        }
        return .reference(
            .init(
                targetKind: targetKind, targetId: try text(object["targetId"]), targetState: state))
    }
}

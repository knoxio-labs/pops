import AppCore
import Foundation
import Testing

/// One protocol-2 primitive kind as the inventory pillar wrote it: the wire
/// JSON of its first single value and first collection in
/// `Contracts/value-vectors-v1.json`, on a synthetic Bulb catalogue with a
/// stored and a computed field of that kind.
internal struct Protocol2KindCase: Sendable, CustomTestStringConvertible {
    internal let kind: InventoryPrimitiveKind
    internal let index: Int
    internal let one: String
    /// `nil` where the catalogue forbids a collection (`boolean`).
    internal let many: [String]?
    internal var fixedUnit: String?
    internal var referenceKinds: [String] = []
    internal var enumOptionIds: [String] = []

    internal var testDescription: String { kind.rawValue }

    internal var storedOneId: String { Protocol2KindWire.fieldId(1, index) }
    internal var storedManyId: String { Protocol2KindWire.fieldId(2, index) }
    internal var computedId: String { Protocol2KindWire.fieldId(3, index) }

    /// `one` read as the kind, by the same oracle the value-vector suite uses.
    internal func expectedOne() throws -> InventoryPrimitiveValue {
        try ValueVectorExpectations.primitive(
            JSONSerialization.jsonObject(with: Data(one.utf8), options: [.fragmentsAllowed]),
            kind: kind)
    }

    /// Option ids are unique across a revision, so only the first field
    /// declares them; the replica never checks a value's option membership.
    internal func catalogueFields() -> [String] {
        var fields = [
            field(
                id: storedOneId, key: "\(kind.rawValue)_one", cardinality: "one",
                storage: "stored", options: enumOptionIds)
        ]
        if many != nil {
            fields.append(
                field(
                    id: storedManyId, key: "\(kind.rawValue)_many", cardinality: "many",
                    storage: "stored"))
        }
        fields.append(
            field(
                id: computedId, key: "\(kind.rawValue)_computed", cardinality: "one",
                storage: "computed"))
        return fields
    }

    private func field(
        id: String, key: String, cardinality: String, storage: String, options: [String] = []
    ) -> String {
        Protocol2Wire.field(
            id: id, key: key, label: key, kind: kind.rawValue, storage: storage, sortOrder: index,
            cardinality: cardinality, fixedUnit: fixedUnit, referenceKinds: referenceKinds,
            enumOptionIds: options)
    }
}

/// Every protocol-2 primitive kind on one item of the Bulb type, stored and
/// computed, with the pillar's own wire values.
internal enum Protocol2KindWire {
    private typealias File = ValueVectorFile

    internal static func fieldId(_ group: Int, _ index: Int) -> String {
        String(format: "f0000000-0000-4000-8000-%06d%06d", group, index)
    }

    internal static func cases() throws -> [Protocol2KindCase] {
        let file = try File.load()
        return try InventoryPrimitiveKind.allCases.enumerated().map { index, kind in
            try kindCase(kind, index: index, vectors: file.vectors)
        }
    }

    private static func firstValues(
        _ vectors: [[String: Any]], kind: InventoryPrimitiveKind, cardinality: String
    ) throws -> [Any]? {
        let vector = vectors.first {
            $0["kind"] as? String == kind.rawValue && $0["cardinality"] as? String == cardinality
                && $0["fieldValue"] is [String: Any]
        }
        guard let vector else { return nil }
        return try File.require(
            (vector["fieldValue"] as? [String: Any])?["values"] as? [Any], "values")
    }

    private static func kindCase(
        _ kind: InventoryPrimitiveKind, index: Int, vectors: [[String: Any]]
    ) throws -> Protocol2KindCase {
        let one = try File.require(
            try firstValues(vectors, kind: kind, cardinality: "one")?.first,
            "a single \(kind.rawValue) value")
        let many = try firstValues(vectors, kind: kind, cardinality: "many")
        let every = [one] + (many ?? [])
        let objects = every.compactMap { $0 as? [String: Any] }
        return Protocol2KindCase(
            kind: kind, index: index, one: try File.json(one),
            many: try many.map { try $0.map(File.json) },
            fixedUnit: kind == .measurement ? objects.first?["unit"] as? String : nil,
            referenceKinds: kind == .reference ? ["item", "location"] : [],
            enumOptionIds: kind == .enumeration
                ? Array(Set(objects.compactMap { $0["optionId"] as? String })).sorted() : [])
    }

    internal static func catalogue(_ cases: [Protocol2KindCase], revision: Int = 2) -> String {
        Protocol2Wire.catalogue(revision: revision, fields: cases.flatMap { $0.catalogueFields() })
    }

    internal static func item(
        stored: [(String, [String])], computed: [(String, String)], catalogueRevision: Int = 2,
        computedEntries: [String] = []
    ) -> String {
        let fieldValues = stored.map { fieldId, values in
            """
            {"fieldId":"\(fieldId)","source":"stored","catalogueRevision":\(catalogueRevision),\
            "values":[\(values.joined(separator: ","))]}
            """
        }.joined(separator: ",")
        let computedValues =
            (computed.map { computedEntry($0, $1, revision: catalogueRevision) } + computedEntries)
            .joined(separator: ",")
        return InventoryWire.item(
            id: Protocol2Wire.lampId, typeId: Protocol2Wire.bulbType,
            catalogueRevision: catalogueRevision, fieldValues: "[\(fieldValues)]",
            computedValues: "[\(computedValues)]")
    }

    /// One computed entry: evaluated at `revision`, or overridden when
    /// `overrideRevision` names the revision the override was written against.
    internal static func computedEntry(
        _ fieldId: String, _ value: String, revision: Int = 2, overrideRevision: Int? = nil
    ) -> String {
        let state =
            overrideRevision.map {
                #""state":"overridden","override":{"catalogueRevision":\#($0)}"#
            } ?? #""state":"ok""#
        return """
            {"fieldId":"\(fieldId)","source":"computed","catalogueRevision":\(revision),\
            \(state),"values":[\(value)],"dependencies":[],"traversedItemIds":[]}
            """
    }
}

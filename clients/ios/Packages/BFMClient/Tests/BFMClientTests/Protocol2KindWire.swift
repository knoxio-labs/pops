import AppCore
import Foundation
import Testing

/// One protocol-2 primitive kind as the server writes it
/// (`pillars/inventory/src/catalogue/value-dispatch.ts`): the wire JSON of a
/// single value and of a two-value collection, and the typed values each
/// must read back as.
internal struct Protocol2KindCase: Sendable, CustomTestStringConvertible {
    internal let kind: String
    internal let index: Int
    internal let one: String
    internal let many: [String]
    internal let expectedOne: InventoryPrimitiveValue
    internal let expectedMany: [InventoryPrimitiveValue]
    internal var fixedUnit: String?
    internal var referenceKinds: [String] = []
    internal var enumOptionIds: [String] = []

    internal var testDescription: String { kind }

    internal var storedOneId: String { Protocol2KindWire.fieldId(1, index) }
    internal var storedManyId: String { Protocol2KindWire.fieldId(2, index) }
    internal var computedId: String { Protocol2KindWire.fieldId(3, index) }

    /// Option ids are unique across a revision, so only the first field
    /// declares them; the replica never checks a value's option membership.
    internal func catalogueFields() -> [String] {
        [
            field(
                id: storedOneId, key: "\(kind)_one", cardinality: "one", storage: "stored",
                options: enumOptionIds),
            field(id: storedManyId, key: "\(kind)_many", cardinality: "many", storage: "stored"),
            field(id: computedId, key: "\(kind)_computed", cardinality: "one", storage: "computed"),
        ]
    }

    private func field(
        id: String, key: String, cardinality: String, storage: String, options: [String] = []
    ) -> String {
        Protocol2Wire.field(
            id: id, key: key, label: key, kind: kind, storage: storage, sortOrder: index,
            cardinality: cardinality, fixedUnit: fixedUnit, referenceKinds: referenceKinds,
            enumOptionIds: options)
    }
}

/// Every protocol-2 primitive kind on one item of the Bulb type, stored
/// (one and many) and computed.
internal enum Protocol2KindWire {
    internal static let optionA = "a1b2c3d4-0000-4000-8000-00000000000a"
    internal static let optionB = "a1b2c3d4-0000-4000-8000-00000000000b"

    internal static func fieldId(_ group: Int, _ index: Int) -> String {
        String(format: "f0000000-0000-4000-8000-%06d%06d", group, index)
    }

    internal static func cases() throws -> [Protocol2KindCase] {
        try scalarCases() + textualCases() + structuredCases()
    }

    private static func decimal(_ text: String) throws -> InventoryPrimitiveValue {
        .decimal(try InventoryDecimal(text))
    }

    private static func scalarCases() throws -> [Protocol2KindCase] {
        [
            Protocol2KindCase(
                kind: "short_text", index: 0, one: #""Brass""#, many: [#""a""#, #""b""#],
                expectedOne: .string("Brass"), expectedMany: [.string("a"), .string("b")]),
            Protocol2KindCase(
                kind: "long_text", index: 1, one: #""Line one\nline two""#,
                many: [#""first""#, #""second""#],
                expectedOne: .string("Line one\nline two"),
                expectedMany: [.string("first"), .string("second")]),
            Protocol2KindCase(
                kind: "integer", index: 2, one: "42", many: ["1", "-3"],
                expectedOne: .integer(try InventoryInteger(42)),
                expectedMany: [
                    .integer(try InventoryInteger(1)), .integer(try InventoryInteger(-3)),
                ]),
            Protocol2KindCase(
                kind: "decimal", index: 3, one: #""12.30""#, many: [#""1.50""#, #""0.000000001""#],
                expectedOne: try Self.decimal("12.30"),
                expectedMany: [try Self.decimal("1.50"), try Self.decimal("0.000000001")]),
            Protocol2KindCase(
                kind: "boolean", index: 4, one: "true", many: ["true", "false"],
                expectedOne: .boolean(true), expectedMany: [.boolean(true), .boolean(false)]),
        ]
    }

    private static func textualCases() throws -> [Protocol2KindCase] {
        [
            Protocol2KindCase(
                kind: "date", index: 7, one: #""2024-02-29""#,
                many: [#""2026-01-01""#, #""2026-12-31""#],
                expectedOne: .date(try InventoryCanonicalDate("2024-02-29")),
                expectedMany: [
                    .date(try InventoryCanonicalDate("2026-01-01")),
                    .date(try InventoryCanonicalDate("2026-12-31")),
                ]),
            Protocol2KindCase(
                kind: "date_time", index: 8, one: #""2026-09-24T10:11:12.345Z""#,
                many: [#""2026-01-01T00:00:00.000Z""#, #""2026-12-31T23:59:59.999Z""#],
                expectedOne: .dateTime(try InventoryCanonicalDateTime("2026-09-24T10:11:12.345Z")),
                expectedMany: [
                    .dateTime(try InventoryCanonicalDateTime("2026-01-01T00:00:00.000Z")),
                    .dateTime(try InventoryCanonicalDateTime("2026-12-31T23:59:59.999Z")),
                ]),
            Protocol2KindCase(
                kind: "url", index: 9, one: #""https://example.com/manual.pdf""#,
                many: [#""https://example.com/""#, #""https://example.org/a?b=c""#],
                expectedOne: .url(try InventoryCanonicalURL("https://example.com/manual.pdf")),
                expectedMany: [
                    .url(try InventoryCanonicalURL("https://example.com/")),
                    .url(try InventoryCanonicalURL("https://example.org/a?b=c")),
                ]),
        ]
    }

    private static func structuredCases() throws -> [Protocol2KindCase] {
        let lamp = Protocol2Wire.lampId
        let reference = #"{"targetKind":"item","targetId":"\#(lamp)"}"#
        let resolved = InventoryPrimitiveValue.reference(
            .init(targetKind: .item, targetId: lamp, targetState: .resolved))
        return [
            Protocol2KindCase(
                kind: "enum", index: 5, one: #"{"optionId":"\#(optionA)"}"#,
                many: [#"{"optionId":"\#(optionA)"}"#, #"{"optionId":"\#(optionB)"}"#],
                expectedOne: .enumeration(optionId: optionA),
                expectedMany: [.enumeration(optionId: optionA), .enumeration(optionId: optionB)],
                enumOptionIds: [optionA, optionB]),
            Protocol2KindCase(
                kind: "measurement", index: 6, one: #"{"amount":"2.50","unit":"kg"}"#,
                many: [#"{"amount":"1","unit":"kg"}"#, #"{"amount":"0.5","unit":"kg"}"#],
                expectedOne: .measurement(amount: try InventoryDecimal("2.50"), unit: "kg"),
                expectedMany: [
                    .measurement(amount: try InventoryDecimal("1"), unit: "kg"),
                    .measurement(amount: try InventoryDecimal("0.5"), unit: "kg"),
                ], fixedUnit: "kg"),
            Protocol2KindCase(
                kind: "reference", index: 10, one: reference, many: [reference, reference],
                expectedOne: resolved, expectedMany: [resolved, resolved],
                referenceKinds: ["item"]),
        ]
    }

    /// A computed value read back as it was delivered: the replica does not
    /// resolve a reference inside a server evaluation.
    internal static func expectedComputed(_ kindCase: Protocol2KindCase) -> InventoryPrimitiveValue
    {
        guard case .reference(let value) = kindCase.expectedOne else { return kindCase.expectedOne }
        return .reference(.init(targetKind: value.targetKind, targetId: value.targetId))
    }

    internal static func catalogue(_ cases: [Protocol2KindCase], revision: Int = 2) -> String {
        Protocol2Wire.catalogue(revision: revision, fields: cases.flatMap { $0.catalogueFields() })
    }

    /// The stored entries of `cases`, one then many, as the item carries them.
    internal static func storedEntries(_ cases: [Protocol2KindCase]) -> [(String, [String])] {
        cases.flatMap { [($0.storedOneId, [$0.one]), ($0.storedManyId, $0.many)] }
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

    /// `values` re-serialised with sorted keys, as ``SentMutation/args`` is.
    internal static func editArgs(_ stored: [(String, [String])]) throws -> String {
        let patches = try stored.map { fieldId, values in
            let parsed = try JSONSerialization.jsonObject(
                with: Data("[\(values.joined(separator: ","))]".utf8), options: [.fragmentsAllowed])
            return ["fieldId": fieldId, "values": parsed]
        }
        let data = try JSONSerialization.data(
            withJSONObject: ["values": patches], options: [.sortedKeys])
        guard let args = String(bytes: data, encoding: .utf8) else {
            throw CocoaError(.fileReadInapplicableStringEncoding)
        }
        return args
    }
}

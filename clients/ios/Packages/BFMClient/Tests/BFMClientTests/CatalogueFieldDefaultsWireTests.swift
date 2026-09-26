import AppCore
import Testing

@testable import BFMClient

/// A default the contract rules out on the catalogue-revision route.
internal struct CatalogueDefaultRefusal: Sendable, CustomTestStringConvertible {
    internal let label: String
    internal let field: String

    internal var testDescription: String { label }

    internal static let all: [Self] = [
        Self(
            label: "a decimal that is not canonical",
            field: Protocol2Wire.field(
                id: "d", key: "d", label: "D", kind: "decimal", defaultValues: #"["abc"]"#)),
        Self(
            label: "a measurement in another unit",
            field: Protocol2Wire.field(
                id: "m", key: "m", label: "M", fixedUnit: "lm",
                defaultValues: #"[{"amount":"60","unit":"W"}]"#)),
        Self(
            label: "two defaults on a one-value field",
            field: Protocol2Wire.field(
                id: "t", key: "t", label: "T", kind: "short_text",
                defaultValues: #"["a","b"]"#)),
        Self(
            label: "a default on a computed field",
            field: Protocol2Wire.field(
                id: "c", key: "c", label: "C", kind: "integer", storage: "computed",
                defaultValues: "[6]")),
        Self(
            label: "a default on a reference field",
            field: Protocol2Wire.field(
                id: "r", key: "r", label: "R", kind: "reference", referenceKinds: ["item"],
                defaultValues: #"[{"targetKind":"item","targetId":"x"}]"#)),
    ]
}

/// POPS-4846: a field's `defaultValues` arrive typed by the field's kind, an
/// older server's payload without the key reads as no defaults, and a default
/// the contract rules out refuses the revision rather than being dropped.
@Suite("Catalogue field defaults on the wire", .timeLimit(.minutes(1)))
internal struct CatalogueFieldDefaultsWireTests {
    private static func fetch(_ fields: [String]) async throws -> [InventoryCatalogueField] {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok, json: Protocol2Wire.catalogue(revision: 2, fields: fields)))
        let catalogue = try await transport.fetchCatalogue(revision: 2)
        return try #require(catalogue.types.first).fields
    }

    @Test("a payload without the key reads as no defaults")
    func absentKey() async throws {
        let fields = try await Self.fetch([
            Protocol2Wire.field(id: "lumens", key: "lumens", label: "Lumens", fixedUnit: "lm")
        ])

        #expect(fields.map(\.defaultValues) == [[]])
    }

    @Test("an empty list reads as no defaults")
    func emptyList() async throws {
        let fields = try await Self.fetch([
            Protocol2Wire.field(
                id: "lumens", key: "lumens", label: "Lumens", fixedUnit: "lm", defaultValues: "[]")
        ])

        #expect(fields.map(\.defaultValues) == [[]])
    }

    @Test("defaults are typed by their field's kind, in order")
    func typedByKind() async throws {
        let fields = try await Self.fetch([
            Protocol2Wire.field(
                id: "lumens", key: "lumens", label: "Lumens", sortOrder: 0, fixedUnit: "lm",
                defaultValues: #"[{"amount":"800","unit":"lm"}]"#),
            Protocol2Wire.field(
                id: "ratio", key: "ratio", label: "Ratio", kind: "decimal", sortOrder: 1,
                defaultValues: #"["1.5"]"#),
            Protocol2Wire.field(
                id: "bought", key: "bought", label: "Bought", kind: "date", sortOrder: 2,
                defaultValues: #"["2026-09-01"]"#),
            Protocol2Wire.field(
                id: "tags", key: "tags", label: "Tags", kind: "short_text", sortOrder: 3,
                cardinality: "many", defaultValues: #"["warm","dimmable"]"#),
            Protocol2Wire.field(
                id: "finish", key: "finish", label: "Finish", kind: "enum", sortOrder: 4,
                enumOptionIds: ["opt-matte"], defaultValues: #"[{"optionId":"opt-matte"}]"#),
        ])
        let byId = Dictionary(uniqueKeysWithValues: fields.map { ($0.id, $0.defaultValues) })

        #expect(byId["lumens"] == [.measurement(amount: try InventoryDecimal("800"), unit: "lm")])
        #expect(byId["ratio"] == [.decimal(try InventoryDecimal("1.5"))])
        #expect(byId["bought"] == [.date(try InventoryCanonicalDate("2026-09-01"))])
        #expect(byId["tags"] == [.string("warm"), .string("dimmable")])
        #expect(byId["finish"] == [.enumeration(optionId: "opt-matte")])
    }

    @Test(
        "a default the contract rules out refuses the revision",
        arguments: CatalogueDefaultRefusal.all)
    func refusal(_ refusal: CatalogueDefaultRefusal) async throws {
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await Self.fetch([refusal.field])
        }
    }
}

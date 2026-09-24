import AppCore
import InventoryReplica
import Testing

@testable import BFMClient

/// A wire value the server never sends for its field's kind.
internal struct Protocol2KindMismatch: Sendable, CustomTestStringConvertible {
    internal let label: String
    internal let fieldId: @Sendable (Protocol2KindCase) -> String
    internal let kind: String
    internal let wire: String

    internal var testDescription: String { label }

    internal static func computed(_ kind: String, _ wire: String) -> Self {
        Self(label: "computed \(kind) \(wire)", fieldId: \.computedId, kind: kind, wire: wire)
    }

    /// Stored mismatches come from the value vectors' `malformed_value` cases
    /// (`ValueVectorRoundTripTests`); a computed value is never produced by a
    /// write the engine could refuse, so these stay here.
    internal static let all: [Self] = [
        .computed("decimal", #""abc""#), .computed("date", #""yesterday""#),
        .computed("date_time", #""2026-09-24""#), .computed("url", #""ftp://example.com/""#),
        .computed("integer", #""6""#), .computed("short_text", "6"),
    ]
}

/// POPS-4354: a protocol-2 value is read as the kind its catalogue field
/// declares, not guessed from its JSON shape. A value that does not parse as
/// its field's kind, or names a field its revision does not declare, is a
/// contract mismatch: the page is refused and nothing is stored. The positive
/// round trip of every kind is `ValueVectorRoundTripTests`.
@Suite("Protocol-2 values decode by catalogue kind", .timeLimit(.minutes(1)))
internal struct Protocol2KindDecodeTests {
    private static func download(
        _ harness: LocalFirstHarness, item: String, cases: [Protocol2KindCase]
    ) async throws {
        await harness.server.enqueue(
            "snapshot", .ok(Protocol2Wire.snapshot(items: [item], catalogueRevision: 2)))
        await harness.server.set("catalogue:2", .ok(Protocol2KindWire.catalogue(cases)))
        await harness.server.set("changes", .ok(Protocol2Wire.changes(catalogueRevision: 2)))
        try await harness.store.download()
    }

    private static func lamp(_ harness: LocalFirstHarness) throws -> InventoryItem? {
        try harness.replica.read(.item(id: Protocol2Wire.lampId))
    }

    @Test(
        "a value that does not parse as its field's kind refuses the page",
        arguments: Protocol2KindMismatch.all)
    func mismatchRefusesPage(_ mismatch: Protocol2KindMismatch) async throws {
        let cases = try Protocol2KindWire.cases()
        let kindCase = try #require(cases.first { $0.kind.rawValue == mismatch.kind })
        let fieldId = mismatch.fieldId(kindCase)
        let isComputed = fieldId == kindCase.computedId
        let item = Protocol2KindWire.item(
            stored: isComputed ? [] : [(fieldId, [mismatch.wire])],
            computed: isComputed ? [(fieldId, mismatch.wire)] : [])
        let harness = try LocalFirstHarness()

        await #expect(throws: RepositoryError.contractMismatch) {
            try await Self.download(harness, item: item, cases: cases)
        }
        #expect(try Self.lamp(harness) == nil)
    }

    @Test("a value for a field its catalogue revision does not declare refuses the page")
    func undeclaredFieldRefusesPage() async throws {
        let cases = try Protocol2KindWire.cases()
        let item = Protocol2KindWire.item(
            stored: [(Protocol2KindWire.fieldId(9, 0), [#""Brass""#])], computed: [])
        let harness = try LocalFirstHarness()

        await #expect(throws: RepositoryError.contractMismatch) {
            try await Self.download(harness, item: item, cases: cases)
        }
        #expect(try Self.lamp(harness) == nil)
    }

    @Test("a computed field left at an older revision is typed by the field's kind")
    func computedAtOlderRevisionReadsBackTyped() async throws {
        let cases = try Protocol2KindWire.cases()
        let decimal = try #require(cases.first { $0.kind == .decimal })
        let date = try #require(cases.first { $0.kind == .date })
        let item = Protocol2KindWire.item(
            stored: [], computed: [],
            computedEntries: [
                Protocol2KindWire.computedEntry(decimal.computedId, decimal.one, revision: 1),
                Protocol2KindWire.computedEntry(
                    date.computedId, date.one, revision: 1, overrideRevision: 1),
            ])
        let harness = try LocalFirstHarness()
        await harness.server.set(
            "catalogue:1", .ok(Protocol2KindWire.catalogue(cases, revision: 1)))
        try await Self.download(harness, item: item, cases: cases)

        let lamp = try #require(try Self.lamp(harness))
        let evaluation = { (fieldId: String) in
            lamp.computedValues.first { $0.fieldId == fieldId }?.evaluation
        }
        #expect(evaluation(decimal.computedId) == .ok(try decimal.expectedOne()))
        #expect(
            evaluation(date.computedId)
                == .overridden(try date.expectedOne(), overrideCatalogueRevision: 1))
    }

    @Test("an overridden computed value of the wrong kind refuses the page")
    func overriddenMismatchRefusesPage() async throws {
        let cases = try Protocol2KindWire.cases()
        let decimal = try #require(cases.first { $0.kind == .decimal })
        let item = Protocol2KindWire.item(
            stored: [], computed: [],
            computedEntries: [
                Protocol2KindWire.computedEntry(decimal.computedId, #""12,5""#, overrideRevision: 2)
            ])
        let harness = try LocalFirstHarness()

        await #expect(throws: RepositoryError.contractMismatch) {
            try await Self.download(harness, item: item, cases: cases)
        }
        #expect(try Self.lamp(harness) == nil)
    }

    @Test("a computed value for a field no held revision declares refuses the page")
    func undeclaredComputedFieldRefusesPage() async throws {
        let cases = try Protocol2KindWire.cases()
        let item = Protocol2KindWire.item(
            stored: [], computed: [(Protocol2KindWire.fieldId(9, 0), #""Brass""#)])
        let harness = try LocalFirstHarness()

        await #expect(throws: RepositoryError.contractMismatch) {
            try await Self.download(harness, item: item, cases: cases)
        }
        #expect(try Self.lamp(harness) == nil)
    }

    @Test("a stored value at a revision the server cannot serve refuses the page")
    func storedAtUnservableRevisionRefusesPage() async throws {
        let cases = try Protocol2KindWire.cases()
        let shortText = try #require(cases.first { $0.kind == .shortText })
        let item = Protocol2KindWire.item(
            stored: [(shortText.storedOneId, [shortText.one])], computed: [], catalogueRevision: 1)
        let harness = try LocalFirstHarness()

        await #expect(throws: RepositoryError.unavailable) {
            try await Self.download(harness, item: item, cases: cases)
        }
        #expect(try Self.lamp(harness) == nil)
    }
}

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

    internal static func stored(_ kind: String, _ wire: String) -> Self {
        Self(label: "stored \(kind) \(wire)", fieldId: \.storedOneId, kind: kind, wire: wire)
    }

    internal static func computed(_ kind: String, _ wire: String) -> Self {
        Self(label: "computed \(kind) \(wire)", fieldId: \.computedId, kind: kind, wire: wire)
    }

    internal static let all: [Self] = [
        .stored("short_text", "7"), .stored("short_text", #""""#),
        .stored("long_text", "true"),
        .stored("integer", #""42""#), .stored("integer", "true"),
        .stored("decimal", "12"), .stored("decimal", #""12.3.4""#), .stored("decimal", #""-0""#),
        .stored("decimal", #""1.0000000001""#), .stored("decimal", #""1e3""#),
        .stored("boolean", #""true""#), .stored("boolean", "1"),
        .stored("enum", #""a1b2c3d4-0000-4000-8000-00000000000a""#),
        .stored("measurement", #""2.50""#),
        .stored("date", #""2026-02-30""#), .stored("date", #""2026-9-1""#),
        .stored("date", "20260901"),
        .stored("date_time", #""2026-09-24T10:11:12Z""#),
        .stored("date_time", #""2026-09-24T10:11:12.345+10:00""#),
        .stored("url", #""http://example.com/""#), .stored("url", #""not a url""#),
        .stored("url", "3"),
        .stored("reference", #""6c0a2f6e-9d1b-4f3a-8e57-1b2c3d4e5f60""#),
        .computed("decimal", #""abc""#), .computed("date", #""yesterday""#),
        .computed("date_time", #""2026-09-24""#), .computed("url", #""ftp://example.com/""#),
        .computed("integer", #""6""#), .computed("short_text", "6"),
    ]
}

/// POPS-4354: a protocol-2 value is read as the kind its catalogue field
/// declares, not guessed from its JSON shape. Every primitive kind travels
/// from the BFM's wire JSON through the real transport into the replica,
/// reads back typed, survives a local edit, and is sent back to the server
/// exactly as it arrived. A value that does not parse as its field's kind is
/// a contract mismatch: the page is refused and nothing is stored.
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

    private static func everyKindItem(_ cases: [Protocol2KindCase]) -> String {
        Protocol2KindWire.item(
            stored: Protocol2KindWire.storedEntries(cases),
            computed: cases.map { ($0.computedId, $0.one) })
    }

    private static func lamp(_ harness: LocalFirstHarness) throws -> InventoryItem? {
        try harness.replica.read(.item(id: Protocol2Wire.lampId))
    }

    @Test("every kind, one and many, stored and computed, reads back as its catalogue kind")
    func everyKindReadsBackTyped() async throws {
        let cases = try Protocol2KindWire.cases()
        let harness = try LocalFirstHarness()
        try await Self.download(harness, item: Self.everyKindItem(cases), cases: cases)

        let lamp = try #require(try Self.lamp(harness))
        for kindCase in cases {
            let stored = { (fieldId: String) in
                lamp.fieldValues.first { $0.fieldId == fieldId && $0.source == .stored }?.state
            }
            #expect(
                stored(kindCase.storedOneId) == .value([kindCase.expectedOne]), "\(kindCase.kind)")
            #expect(
                stored(kindCase.storedManyId) == .value(kindCase.expectedMany), "\(kindCase.kind)")
            let computed = lamp.computedValues.first { $0.fieldId == kindCase.computedId }
            #expect(
                computed?.evaluation == .ok(Protocol2KindWire.expectedComputed(kindCase)),
                "\(kindCase.kind)")
        }
    }

    @Test("the read-back values pass a local edit and go back to the server exactly as they came")
    func readBackEditEncodesWireValues() async throws {
        let cases = try Protocol2KindWire.cases()
        let harness = try LocalFirstHarness(online: false)
        try await Self.download(harness, item: Self.everyKindItem(cases), cases: cases)
        let lamp = try #require(try Self.lamp(harness))
        let stored = Protocol2KindWire.storedEntries(cases)
        let patches = try stored.map { fieldId, _ in
            let entry = try #require(
                lamp.fieldValues.first { $0.fieldId == fieldId && $0.source == .stored })
            guard case .value(let values) = entry.state else {
                throw Protocol2KindTestError.noValue(fieldId)
            }
            return InventoryProtocol2FieldPatch(fieldId: fieldId, values: values)
        }
        await harness.server.onMutations { sent in
            InventoryWire.mutationsResponse(
                sent.map {
                    InventoryWire.appliedOutcome(mutationId: $0.mutationId, revision: 2, seq: 12)
                }.joined(separator: ","))
        }

        _ = try await harness.store.perform(
            .editProtocol2Item(id: Protocol2Wire.lampId, catalogueRevision: 2, values: patches))
        harness.reachability.set(true)
        await harness.store.synchronize()

        let sent = try #require(await harness.server.mutations.first)
        #expect(sent.op == "item.edit")
        #expect(sent.args == (try Protocol2KindWire.editArgs(stored)))
        #expect(try harness.ledger.repairs.isEmpty)
    }

    @Test(
        "a value that does not parse as its field's kind refuses the page",
        arguments: Protocol2KindMismatch.all)
    func mismatchRefusesPage(_ mismatch: Protocol2KindMismatch) async throws {
        let cases = try Protocol2KindWire.cases()
        let kindCase = try #require(cases.first { $0.kind == mismatch.kind })
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
        let decimal = try #require(cases.first { $0.kind == "decimal" })
        let date = try #require(cases.first { $0.kind == "date" })
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
        #expect(evaluation(decimal.computedId) == .ok(decimal.expectedOne))
        #expect(
            evaluation(date.computedId)
                == .overridden(date.expectedOne, overrideCatalogueRevision: 1))
    }

    @Test("an overridden computed value of the wrong kind refuses the page")
    func overriddenMismatchRefusesPage() async throws {
        let cases = try Protocol2KindWire.cases()
        let decimal = try #require(cases.first { $0.kind == "decimal" })
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
        let shortText = try #require(cases.first { $0.kind == "short_text" })
        let item = Protocol2KindWire.item(
            stored: [(shortText.storedOneId, [shortText.one])], computed: [], catalogueRevision: 1)
        let harness = try LocalFirstHarness()

        await #expect(throws: RepositoryError.unavailable) {
            try await Self.download(harness, item: item, cases: cases)
        }
        #expect(try Self.lamp(harness) == nil)
    }
}

private enum Protocol2KindTestError: Error {
    case noValue(String)
}

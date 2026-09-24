import AppCore
import Testing

@testable import BFMClient

/// `computedValues` from the wire into ``InventoryComputedValue``: each
/// `state`, the evaluated item revision it is stamped with, and the shapes the
/// contract rules out.
@Suite("BFMInventoryTransport computed values")
internal struct InventoryComputedValueDecodingTests {
    private static let fieldId = "2d8a3c1e-5b7f-4e2a-9c61-0f3d2b8a7e14"
    private static let inputId = "7c1e9a42-3d5b-4f86-a0e2-94b1c6d8f357"

    private static func firstItem(computedValues: String, revision: Int = 4) async throws
        -> InventoryItem
    {
        let transport = StubTransport(
            status: .ok,
            json: InventoryWire.snapshot(
                items: [InventoryWire.item(revision: revision, computedValues: computedValues)]))
        let page = try await BFMInventoryTransport.stubbed(transport).fetchSnapshot(
            cursor: nil, limit: 250)
        return try #require(page.items.first)
    }

    private static func entry(_ state: String, _ rest: String) -> String {
        """
        [{"fieldId":"\(fieldId)","source":"computed","catalogueRevision":3,"state":"\(state)",\
        \(rest)}]
        """
    }

    @Test("an ok value keeps its dependencies and is stamped with the row's revision")
    func okValue() async throws {
        let item = try await Self.firstItem(
            computedValues: Self.entry(
                "ok",
                """
                "values":[{"amount":"6","unit":"l"}],\
                "dependencies":[{"itemId":"item-1","fieldId":"\(Self.inputId)","revision":4}],\
                "traversedItemIds":["item-1"]
                """))

        #expect(
            item.computedValues == [
                InventoryComputedValue(
                    fieldId: Self.fieldId, catalogueRevision: 3,
                    evaluation: .ok(.measurement(amount: try InventoryDecimal("6"), unit: "l")),
                    dependencies: [
                        InventoryValueDependency(
                            itemId: "item-1", fieldId: Self.inputId, revision: 4)
                    ],
                    traversedItemIds: ["item-1"], evaluatedItemRevision: 4)
            ])
    }

    @Test("an overridden value carries the revision the override was written against")
    func overriddenValue() async throws {
        let item = try await Self.firstItem(
            computedValues: Self.entry(
                "overridden",
                """
                "values":[true],"override":{"catalogueRevision":2},\
                "dependencies":[],"traversedItemIds":[]
                """))

        #expect(
            item.computedValues.map(\.evaluation) == [
                .overridden(.boolean(true), overrideCatalogueRevision: 2)
            ])
    }

    @Test("an unavailable value keeps a reason this build has never heard of")
    func unavailableValue() async throws {
        let item = try await Self.firstItem(
            computedValues: Self.entry(
                "unavailable",
                """
                "reason":"quota_exceeded","failedFieldId":"\(Self.inputId)",\
                "dependencies":[],"traversedItemIds":["item-1","item-2"]
                """))

        let value = try #require(item.computedValues.first)
        #expect(
            value.evaluation == .unavailable(reason: "quota_exceeded", failedFieldId: Self.inputId))
        #expect(value.traversedItemIds == ["item-1", "item-2"])
        #expect(value.knownUnavailableReason == nil)
        #expect(value.missingInputs.isEmpty)
    }

    @Test("an unavailable value names every missing input, field and item")
    func missingInputs() async throws {
        let item = try await Self.firstItem(
            computedValues: Self.entry(
                "unavailable",
                """
                "reason":"missing_dependency","failedFieldId":"\(Self.inputId)",\
                "missingInputs":[\
                {"reason":"missing_dependency","fieldId":"\(Self.fieldId)","itemId":"item-1"},\
                {"reason":"reference_deleted","fieldId":"\(Self.inputId)","itemId":"item-2"}],\
                "dependencies":[],"traversedItemIds":["item-1","item-2"]
                """))
        let value = try #require(item.computedValues.first)
        #expect(
            value.missingInputs == [
                InventoryExpressionMissingInput(
                    reason: "missing_dependency", fieldId: Self.fieldId, itemId: "item-1"),
                InventoryExpressionMissingInput(
                    reason: "reference_deleted", fieldId: Self.inputId, itemId: "item-2"),
            ])
    }

    @Test("a state outside the contract fails the page rather than guessing")
    func unknownState() async throws {
        await #expect(throws: (any Error).self) {
            _ = try await Self.firstItem(
                computedValues: Self.entry(
                    "stale", "\"values\":[1],\"dependencies\":[],\"traversedItemIds\":[]"))
        }
    }

    @Test("an ok value with two values fails the page: a computed field holds exactly one")
    func twoValues() async throws {
        await #expect(throws: (any Error).self) {
            _ = try await Self.firstItem(
                computedValues: Self.entry(
                    "ok", "\"values\":[1,2],\"dependencies\":[],\"traversedItemIds\":[]"))
        }
    }

    @Test("an item without computed fields has none")
    func noComputedValues() async throws {
        #expect(try await Self.firstItem(computedValues: "[]").computedValues.isEmpty)
    }
}

import Foundation
import Testing

@testable import AppCore

@Suite("Computed values as the phone shows them")
internal struct InventoryComputedValueTests {
    private static let itemId = "box"
    private static let fieldId = "volume"
    private static let date = Date(timeIntervalSinceReferenceDate: 0)

    private static func item(
        revision: Int = 3, fieldValues: [InventoryItemFieldEntry] = []
    ) -> InventoryItem {
        InventoryItem(
            id: itemId, revision: revision, seq: revision, name: "Box", typeKey: nil,
            fieldValues: fieldValues, placement: .hand, createdAt: date, updatedAt: date)
    }

    private static func computed(
        _ evaluation: InventoryComputedEvaluation,
        dependencies: [InventoryValueDependency] = [
            InventoryValueDependency(itemId: itemId, fieldId: "width", revision: 3)
        ],
        evaluatedItemRevision: Int = 3
    ) -> InventoryComputedValue {
        InventoryComputedValue(
            fieldId: fieldId, catalogueRevision: 2, evaluation: evaluation,
            dependencies: dependencies, traversedItemIds: [itemId],
            evaluatedItemRevision: evaluatedItemRevision)
    }

    private static let six = InventoryPrimitiveValue.string("6 l")
    private static let nine = InventoryPrimitiveValue.string("9 l")

    private static func override(_ value: InventoryPrimitiveValue) -> InventoryItemFieldEntry {
        InventoryItemFieldEntry(
            fieldId: fieldId, state: .value([value]), source: .override, catalogueRevision: 2)
    }

    @Test("a fresh evaluation shows its value")
    func freshValue() {
        let display = Self.computed(.ok(Self.six)).display(in: Self.item()) { _ in nil }

        #expect(display == .value(Self.six))
    }

    @Test("a fresh unavailable evaluation keeps its reason and the field that blocked it")
    func freshUnavailable() {
        let value = Self.computed(
            .unavailable(reason: "missing_dependency", failedFieldId: "width"))

        #expect(
            value.display(in: Self.item()) { _ in nil }
                == .unavailable(reason: "missing_dependency", failedFieldId: "width"))
        #expect(value.knownUnavailableReason == .missingDependency)
    }

    @Test("a reason this build predates is kept verbatim, not mistaken for a known one")
    func unknownReason() {
        let value = Self.computed(.unavailable(reason: "quota_exceeded", failedFieldId: "width"))

        #expect(value.knownUnavailableReason == nil)
        #expect(
            value.display(in: Self.item()) { _ in nil }
                == .unavailable(reason: "quota_exceeded", failedFieldId: "width"))
    }

    @Test("an override the phone holds wins, whatever the server last evaluated")
    func localOverrideWins() {
        let item = Self.item(revision: 4, fieldValues: [Self.override(Self.nine)])

        #expect(
            Self.computed(.ok(Self.six)).display(in: item) { _ in nil } == .overridden(Self.nine))
    }

    @Test("a server override the phone has since cleared is out of date, not the stale override")
    func clearedOverride() {
        let value = Self.computed(
            .overridden(Self.nine, overrideCatalogueRevision: 2), dependencies: [])

        #expect(value.display(in: Self.item(revision: 4)) { _ in nil } == .outOfDate)
    }

    @Test("a server override the phone still holds shows as overridden")
    func serverOverride() {
        let value = Self.computed(
            .overridden(Self.nine, overrideCatalogueRevision: 2), dependencies: [])
        let item = Self.item(fieldValues: [Self.override(Self.nine)])

        #expect(value.display(in: item) { _ in nil } == .overridden(Self.nine))
    }

    @Test("a local edit to the item invalidates its evaluation")
    func localEditInvalidates() {
        let display = Self.computed(.ok(Self.six)).display(in: Self.item(revision: 4)) { _ in nil }

        #expect(display == .outOfDate)
    }

    @Test("a newer revision of a referenced item invalidates the evaluation")
    func dependencyChangeInvalidates() {
        let value = Self.computed(
            .ok(Self.six),
            dependencies: [InventoryValueDependency(itemId: "shelf", fieldId: "depth", revision: 7)]
        )

        #expect(value.display(in: Self.item()) { $0 == "shelf" ? 7 : nil } == .value(Self.six))
        #expect(value.display(in: Self.item()) { $0 == "shelf" ? 8 : nil } == .outOfDate)
        #expect(value.display(in: Self.item()) { _ in nil } == .outOfDate)
    }

    @Test("the evaluation round-trips through its stored form")
    func codableRoundTrip() throws {
        let values = [
            Self.computed(.ok(Self.six)),
            Self.computed(.overridden(Self.nine, overrideCatalogueRevision: 1), dependencies: []),
            Self.computed(.unavailable(reason: "reference_deleted", failedFieldId: "shelf")),
        ]

        let decoded = try JSONDecoder().decode(
            [InventoryComputedValue].self, from: JSONEncoder().encode(values))

        #expect(decoded == values)
    }
}

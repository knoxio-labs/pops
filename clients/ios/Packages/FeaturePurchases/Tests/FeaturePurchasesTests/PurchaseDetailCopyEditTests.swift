import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase detail edit presentation")
internal struct PurchaseDetailCopyEditTests {
    private let lines = [
        PurchaseDetailLine.fake(id: "first", name: "Bread"),
        PurchaseDetailLine.fake(id: "middle", name: "Milk"),
        PurchaseDetailLine.fake(id: "last", name: "Tea"),
    ]

    @Test("line labels use today's one-based first and last positions")
    func linePositions() {
        #expect(
            PurchaseDetailCopy.label(
                for: change(.lineName, itemID: "first"), lines: lines)
                == "Item 1")
        #expect(
            PurchaseDetailCopy.label(
                for: change(.lineTotal, itemID: "last"), lines: lines)
                == "Item 3")
        #expect(
            PurchaseDetailCopy.label(
                for: change(.lineQuantity, itemID: "missing"), lines: lines)
                == "Item")
    }

    @Test("a removed line is named Removed even though it has no current position")
    func removedLine() {
        let removed = change(
            .lineRemoved, itemID: "gone", original: "Old item", current: nil)
        let value = PurchaseOriginalValue(removed, lines: lines)

        #expect(value.label == "Removed")
        #expect(value.original == "Old item")
        #expect(value.current == nil)
        #expect(value.accessibilityLabel == "Removed: was Old item")
    }

    @Test("an added line uses its current position and has no original row")
    func addedLine() {
        let added = change(
            .lineAdded, itemID: "middle", original: nil, current: "Oat milk")
        let value = PurchaseOriginalValue(added, lines: lines)

        #expect(value.label == "Item 2")
        #expect(value.original == nil)
        #expect(value.current == "Oat milk")
        #expect(value.accessibilityLabel == "Item 2: now Oat milk")
    }

    @Test("known headers use reader-facing labels")
    func headerLabels() {
        #expect(PurchaseDetailCopy.label(for: change(.merchant), lines: lines) == "Merchant")
        #expect(PurchaseDetailCopy.label(for: change(.total), lines: lines) == "Total")
        #expect(PurchaseDetailCopy.label(for: change(.orderedOn), lines: lines) == "Date")
    }

    @Test("a field from a newer server retains its raw name")
    func unknownField() {
        #expect(
            PurchaseDetailCopy.label(
                for: change(.unrecognised("accountingSplit")), lines: lines)
                == "accountingSplit")
    }

    @Test("Original is absent when the edit record contains no field changes")
    func originalActionNeedsChanges() {
        #expect(!PurchaseDetailEditedNotice.showsOriginal(edit([])))
        #expect(PurchaseDetailEditedNotice.showsOriginal(edit([change(.merchant)])))
    }

    private func change(
        _ field: PurchaseEditField,
        itemID: String? = nil,
        original: String? = "Before",
        current: String? = "After"
    ) -> PurchaseFieldChange {
        PurchaseFieldChange(
            field: field, itemID: itemID, original: original, current: current)
    }

    private func edit(_ changes: [PurchaseFieldChange]) -> PurchaseEdit {
        PurchaseEdit(editedAt: Date(timeIntervalSince1970: 0), changes: changes)
    }
}

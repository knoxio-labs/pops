import Testing

@testable import FeatureInventory

@Suite("Protocol-2 field row VoiceOver strings")
internal struct InventoryProtocol2RowAccessibilityTests {
    @Test("multiple entries use their field name and position")
    func entryValueNamesPosition() {
        #expect(
            InventoryProtocol2RowAccessibility.entryValue(fieldLabel: "Tags", index: 0, count: 3)
                == "Tags 1")
        #expect(
            InventoryProtocol2RowAccessibility.entryValue(fieldLabel: "Tags", index: 2, count: 3)
                == "Tags 3")
    }

    @Test("a single entry uses only its field name")
    func entryValueOmitsAnUnhelpfulCount() {
        #expect(
            InventoryProtocol2RowAccessibility.entryValue(fieldLabel: "Tags", index: 0, count: 1)
                == "Tags")
    }

    @Test("add names the field it appends to")
    func addNamesField() {
        #expect(InventoryProtocol2RowAccessibility.addEntry(fieldLabel: "Tags") == "Add Tags")
    }

    @Test("a reorder handle names its entry without a one-of-one count")
    func reorderHandleNamesEntry() {
        #expect(
            InventoryProtocol2RowAccessibility.reorderHandle(
                fieldLabel: "Tags", index: 1, count: 3) == "Reorder Tags 2")
        #expect(
            InventoryProtocol2RowAccessibility.reorderHandle(
                fieldLabel: "Tags", index: 0, count: 1) == "Reorder Tags")
    }

    @Test("remove names the field and position only when needed")
    func removeNamesPosition() {
        #expect(
            InventoryProtocol2RowAccessibility.removeEntry(fieldLabel: "Tags", index: 0, count: 3)
                == "Delete Tags 1")
        #expect(
            InventoryProtocol2RowAccessibility.removeEntry(fieldLabel: "Tags", index: 0, count: 1)
                == "Delete Tags")
    }

    @Test("a computed row without a caption is just the field and its value")
    func computedWithoutCaption() {
        #expect(
            InventoryProtocol2RowAccessibility.computed(
                fieldLabel: "Doubled price", valueText: "Not calculated yet", caption: nil)
                == "Doubled price, Not calculated yet")
    }

    @Test("a computed row's caption, when present, is said last")
    func computedWithCaption() {
        #expect(
            InventoryProtocol2RowAccessibility.computed(
                fieldLabel: "Doubled price", valueText: "42", caption: "Overridden")
                == "Doubled price, 42, Overridden")
    }

    @Test("an empty caption is treated the same as no caption")
    func computedWithEmptyCaptionOmitsIt() {
        #expect(
            InventoryProtocol2RowAccessibility.computed(
                fieldLabel: "Doubled price", valueText: "42", caption: "")
                == "Doubled price, 42")
    }
}

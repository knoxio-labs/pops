import Testing

@testable import FeatureInventory

@Suite("Protocol-2 field row VoiceOver strings")
internal struct InventoryProtocol2RowAccessibilityTests {
    @Test("an entry names its field, its position and how many there are")
    func entryValueNamesPositionAndCount() {
        #expect(
            InventoryProtocol2RowAccessibility.entryValue(fieldLabel: "Tags", index: 0, count: 3)
                == "Tags, value 1 of 3")
        #expect(
            InventoryProtocol2RowAccessibility.entryValue(fieldLabel: "Tags", index: 2, count: 3)
                == "Tags, value 3 of 3")
    }

    @Test("a single-entry field still says 1 of 1, not a bare label")
    func entryValueSaysOneOfOneRatherThanOmittingCount() {
        #expect(
            InventoryProtocol2RowAccessibility.entryValue(fieldLabel: "Tags", index: 0, count: 1)
                == "Tags, value 1 of 1")
    }

    @Test("add names the field it appends to")
    func addNamesField() {
        #expect(InventoryProtocol2RowAccessibility.addEntry(fieldLabel: "Tags") == "Add Tags value")
    }

    @Test("move earlier and move later are distinct sentences for the same position")
    func moveLabelsAreDistinct() {
        let earlier = InventoryProtocol2RowAccessibility.moveEarlier(fieldLabel: "Tags", index: 1)
        let later = InventoryProtocol2RowAccessibility.moveLater(fieldLabel: "Tags", index: 1)
        #expect(earlier == "Move Tags value 2 earlier")
        #expect(later == "Move Tags value 2 later")
        #expect(earlier != later)
    }

    @Test("remove names the field and the one-based position being removed")
    func removeNamesPosition() {
        #expect(
            InventoryProtocol2RowAccessibility.removeEntry(fieldLabel: "Tags", index: 0)
                == "Remove Tags value 1")
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

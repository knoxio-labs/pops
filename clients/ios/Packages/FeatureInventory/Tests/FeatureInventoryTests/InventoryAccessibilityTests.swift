import Testing

@testable import FeatureInventory

@Suite("Inventory accessibility identifiers")
internal struct InventoryAccessibilityTests {
    @Test("a protocol-2 field's identifier is keyed by the field's own stable id")
    func protocol2FieldIdentifier() {
        #expect(
            InventoryAccessibility.protocol2Field(id: "field-123")
                == "inventory-field-field-123")
    }

    @Test("two different fields never collide on the same identifier")
    func protocol2FieldIdentifierIsUniquePerField() {
        #expect(
            InventoryAccessibility.protocol2Field(id: "a")
                != InventoryAccessibility.protocol2Field(id: "b"))
    }

    @Test("a many-valued entry's identifier never collides with the scalar field's own")
    func protocol2FieldEntryDoesNotCollideWithScalarField() {
        // If it did, a single-valued field and the first entry of a
        // many-valued one could resolve to the same element.
        #expect(
            InventoryAccessibility.protocol2FieldEntry(id: "field-1", index: 0)
                != InventoryAccessibility.protocol2Field(id: "field-1"))
    }

    @Test("two entries of the same field never collide on the same identifier")
    func protocol2FieldEntryIsUniquePerPosition() {
        #expect(
            InventoryAccessibility.protocol2FieldEntry(id: "field-1", index: 0)
                != InventoryAccessibility.protocol2FieldEntry(id: "field-1", index: 1))
    }

    @Test("the same position of two different fields never collides")
    func protocol2FieldEntryIsUniquePerField() {
        #expect(
            InventoryAccessibility.protocol2FieldEntry(id: "a", index: 0)
                != InventoryAccessibility.protocol2FieldEntry(id: "b", index: 0))
    }

    @Test("add, reorder and remove each have their own identifier, per field and position")
    func protocol2FieldActionIdentifiersAreDistinct() {
        let ids: Set<String> = [
            InventoryAccessibility.protocol2FieldAdd(id: "f"),
            InventoryAccessibility.protocol2FieldReorder(id: "f", index: 0),
            InventoryAccessibility.protocol2FieldRemove(id: "f", index: 0),
            InventoryAccessibility.protocol2FieldReorder(id: "f", index: 1),
            InventoryAccessibility.protocol2FieldRemove(id: "f", index: 1),
            InventoryAccessibility.protocol2FieldEntry(id: "f", index: 0),
            InventoryAccessibility.protocol2FieldEntry(id: "f", index: 1),
        ]
        #expect(ids.count == 7)
    }

    @Test("the Type picker and each of its options have pinned identifiers")
    func typePickerIdentifiers() {
        #expect(InventoryAccessibility.itemTypePicker == "inventory-item-type")
        #expect(InventoryAccessibility.itemTypeNone == "inventory-item-type-option-none")
        #expect(
            InventoryAccessibility.itemTypeOption(id: "type-7")
                == "inventory-item-type-option-type-7")
    }

    @Test("no Type option collides with the picker, another option, or a field")
    func typeOptionIdentifiersAreDistinct() {
        let ids: Set<String> = [
            InventoryAccessibility.itemTypePicker,
            InventoryAccessibility.itemTypeOption(id: "a"),
            InventoryAccessibility.itemTypeOption(id: "b"),
            InventoryAccessibility.protocol2Field(id: "a"),
            InventoryAccessibility.itemNameField,
        ]
        #expect(ids.count == 5)
    }

    @Test("a choice list's options and its clear row have pinned, distinct identifiers")
    func choiceListIdentifiers() {
        #expect(
            InventoryAccessibility.choiceOption(fieldId: "f", optionId: "o")
                == "inventory-field-f-option-o")
        #expect(InventoryAccessibility.choiceClear(fieldId: "f") == "inventory-field-f-clear")
        let ids: Set<String> = [
            InventoryAccessibility.choiceOption(fieldId: "f", optionId: "o"),
            InventoryAccessibility.choiceOption(fieldId: "f", optionId: "p"),
            InventoryAccessibility.choiceOption(fieldId: "g", optionId: "o"),
            InventoryAccessibility.choiceClear(fieldId: "f"),
            InventoryAccessibility.protocol2Field(id: "f"),
            InventoryAccessibility.protocol2FieldEntry(id: "f", index: 0),
        ]
        #expect(ids.count == 6)
    }
}

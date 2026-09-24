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

    @Test("add, move and remove each have their own identifier, per field and position")
    func protocol2FieldActionIdentifiersAreDistinct() {
        let ids: Set<String> = [
            InventoryAccessibility.protocol2FieldAdd(id: "f"),
            InventoryAccessibility.protocol2FieldMoveEarlier(id: "f", index: 0),
            InventoryAccessibility.protocol2FieldMoveLater(id: "f", index: 0),
            InventoryAccessibility.protocol2FieldRemove(id: "f", index: 0),
            InventoryAccessibility.protocol2FieldMoveEarlier(id: "f", index: 1),
            InventoryAccessibility.protocol2FieldMoveLater(id: "f", index: 1),
            InventoryAccessibility.protocol2FieldRemove(id: "f", index: 1),
            InventoryAccessibility.protocol2FieldEntry(id: "f", index: 0),
            InventoryAccessibility.protocol2FieldEntry(id: "f", index: 1),
        ]
        #expect(ids.count == 9)
    }
}

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
}

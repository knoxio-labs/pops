import Testing

@testable import DesignPlayground

@Suite("Inventory computed properties")
internal struct InventoryComputedPropertyTests {
    @Test("storage-box capacity converts cubic centimetres to litres")
    func capacityCalculation() {
        #expect(StorageBoxCapacity.litres(width: "40", height: "30", depth: "25") == "30")
        #expect(StorageBoxCapacity.litres(width: "40.5", height: "30", depth: "25") == "30.38")
    }

    @Test("calculation is unavailable until every positive dimension exists")
    func missingOrInvalidDimensions() {
        #expect(StorageBoxCapacity.litres(width: "", height: "30", depth: "25") == nil)
        #expect(StorageBoxCapacity.litres(width: "0", height: "30", depth: "25") == nil)
        #expect(StorageBoxCapacity.litres(width: "wide", height: "30", depth: "25") == nil)
    }

    @Test("capacity definition explicitly permits item-level overrides")
    func overrideContract() {
        let definition = InventoryComputedPropertyDefinition.capacity

        #expect(definition.name == "Capacity")
        #expect(definition.unit == "L")
        #expect(definition.formula == "Width × Height × Depth ÷ 1000")
        #expect(definition.allowsOverride)
    }
}

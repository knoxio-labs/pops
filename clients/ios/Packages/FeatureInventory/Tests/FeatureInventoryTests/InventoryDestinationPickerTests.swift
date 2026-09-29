import Testing

@testable import FeatureInventory

@Suite("Inventory destination picker")
internal struct InventoryDestinationPickerTests {
    @Test("starts at the picker root by default")
    func startsAtPickerRoot() {
        #expect(InventoryDestinationPickerState().path.isEmpty)
    }
}

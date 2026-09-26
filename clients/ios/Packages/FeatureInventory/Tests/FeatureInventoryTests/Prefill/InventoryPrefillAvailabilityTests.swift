import Observation
import Testing

@testable import FeatureInventory

@MainActor @Observable
private final class InventoryPrefillAvailabilityFake {
    var available = false
}

@MainActor
@Suite("Inventory prefill availability")
internal struct InventoryPrefillAvailabilityTests {
    @Test("availability follows the observed system value")
    func tracksChanges() async {
        let fake = InventoryPrefillAvailabilityFake()
        let availability = InventoryPrefillAvailability { fake.available }

        #expect(!availability.isAvailable)
        fake.available = true
        await awaitObservedCondition { availability.isAvailable }
        #expect(availability.isAvailable)
    }
}

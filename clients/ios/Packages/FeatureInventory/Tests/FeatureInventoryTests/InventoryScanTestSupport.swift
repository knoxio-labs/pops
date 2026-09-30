import AppCore
import AppCoreFakes
import Foundation

@testable import FeatureInventory

@MainActor
internal enum InventoryScanTestSupport {
    static func model(
        items: [InventoryItem] = [],
        camera: StubCameraAuthorization = StubCameraAuthorization(standing: .authorized),
        router: EntityRouterRegistry = EntityRouterRegistry(),
        recents: UserDefaults? = nil
    ) -> InventoryScanViewModel {
        InventoryScanViewModel(
            store: InMemoryInventoryStore(items: items), router: router, camera: camera,
            recents: recents ?? freshDefaults())
    }

    static func freshDefaults() -> UserDefaults {
        guard let defaults = UserDefaults(suiteName: "InventoryScanTests.\(UUID())") else {
            preconditionFailure("Unable to create isolated defaults")
        }
        return defaults
    }

    static func scanned(in defaults: UserDefaults) -> [String] {
        InventorySearchRecents.decode(
            defaults.string(forKey: InventorySearchRecents.scannedKey) ?? "")
    }
}

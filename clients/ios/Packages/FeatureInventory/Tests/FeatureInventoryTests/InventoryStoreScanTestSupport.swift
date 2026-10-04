import AppCore
import AppCoreFakes
import Foundation
import Synchronization

@testable import FeatureInventory

/// A Store here scanner over an in-memory store holding a Box in the Garage,
/// with a clock the test moves by hand.
@MainActor
internal struct InventoryStoreScanRig {
    internal static let box = InventoryStoreTarget.container(id: "box", name: "Box")

    internal final class Clock: Sendable {
        private let moment = Mutex(InventoryFixture.epoch)
        internal var now: Date { moment.withLock { $0 } }
        internal func advance(_ seconds: TimeInterval) {
            moment.withLock { $0 = $0.addingTimeInterval(seconds) }
        }
    }

    internal let model: InventoryStoreScanModel
    internal let store: RecordingInventoryStore
    internal let base: InMemoryInventoryStore
    internal let runner: InventoryCommandRunner
    internal let clock = Clock()

    internal init(
        _ items: [InventoryItem], target: InventoryStoreTarget, camera: StubCameraAuthorization
    ) {
        base = InMemoryInventoryStore(
            items: items
                + [InventoryFixture.item("box", "Box", at: .location("garage"), access: .open)],
            locations: [InventoryFixture.location("garage", "Garage")])
        store = RecordingInventoryStore(base)
        runner = InventoryCommandRunner(store: store)
        model = InventoryStoreScanModel(
            target: target, runner: runner, camera: camera, now: { [clock] in clock.now })
    }

    /// Feeds one decoded payload and waits for whatever it started.
    internal func scan(_ payload: String) async {
        model.didScan(payload)
        await model.pending?.value
    }
}

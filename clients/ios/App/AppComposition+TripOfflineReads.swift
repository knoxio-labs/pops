import AppCore
import Foundation
import Observation

extension AppComposition {
    internal func tripOfflineReads(for device: PairedDevice, root: URL? = nil)
        -> TripOfflineReadCoordinator
    {
        let context = TripOfflineReadContext {
            guard self.session.state == .paired(device) else { return false }
            return try self.credentialStore.pairedDeviceStore.load() == device
        }
        withObservationTracking {
            _ = session.state
        } onChange: {
            context.retire()
        }
        let store = ProtectedTripDocumentStore(
            owner: TripDocumentOfflineOwner(device: device),
            root: {
                if let root { return root }
                return try ProtectedTripDocumentStore.standardRoot()
            },
            isCurrent: {
                try context.assertCurrent()
                return true
            })
        return TripOfflineReadCoordinator(
            trips: tripsRepository(for: device), documents: documentsRepository(for: device),
            store: store, context: context)
    }
}

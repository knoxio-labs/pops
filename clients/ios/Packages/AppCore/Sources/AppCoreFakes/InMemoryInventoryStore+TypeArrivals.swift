import AppCore

/// The type-arrived seams: a catalogue arriving the way a refresh would
/// store one, and the shown-once record `settleTypeArrival(typeKey:)` keeps.
extension InMemoryInventoryStore {
    /// Replaces the catalogue as a refresh that fetched a new version would,
    /// queueing an arrival for every type it adds that was never asked
    /// about, per `InventoryTypeArrival.addedTypeKeys(from:to:)`.
    public func receiveCatalogue(_ catalogue: InventoryCatalogue) {
        let snapshot = state.withLock { current -> State in
            let added = InventoryTypeArrival.addedTypeKeys(from: current.catalogue, to: catalogue)
            for key in added
            where !current.settledTypeArrivals.contains(key)
                && !current.awaitingTypeArrivals.contains(key)
            {
                current.awaitingTypeArrivals.append(key)
            }
            current.catalogue = catalogue
            return current
        }
        notify(snapshot)
    }

    public func settleTypeArrival(typeKey: String) async throws {
        let snapshot = state.withLock { current -> State in
            current.awaitingTypeArrivals.removeAll { $0 == typeKey }
            current.settledTypeArrivals.insert(typeKey)
            return current
        }
        notify(snapshot)
    }
}

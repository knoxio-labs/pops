import AppCore

extension InventoryDrain {
    /// Changes the server answered `catalogue_update_required` for wait on a
    /// newer catalogue: refresh, then move them onto it or open their
    /// repair. A refresh that fails ends the pass as a failed batch would,
    /// and one that finds this build too old for the catalogue blocks it,
    /// which is the Update prompt.
    func settleChangesAwaitingCatalogue() async throws -> InventoryDrainPass? {
        guard try replica.hasChangesAwaitingCatalogue() else { return nil }
        do {
            try await online.refreshThrowing()
        } catch {
            return OnlineInventoryStore.blockReason(for: error) == nil ? .retryLater : .blocked
        }
        try replica.moveChangesAwaitingCatalogue()
        return nil
    }
}

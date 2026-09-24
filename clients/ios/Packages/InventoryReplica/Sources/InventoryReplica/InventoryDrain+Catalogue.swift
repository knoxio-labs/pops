import AppCore

extension InventoryDrain {
    /// Changes the server answered `catalogue_update_required` for wait on a
    /// newer catalogue: refresh, then move them onto it or open their
    /// repair. A refresh that fails ends the pass as a failed batch would,
    /// and one that finds this build too old for the catalogue blocks it,
    /// which is the Update prompt, and marks what is held as needing it.
    func settleChangesAwaitingCatalogue() async throws -> InventoryDrainPass? {
        guard try replica.hasChangesAwaitingCatalogue() else { return nil }
        do {
            try await online.refreshThrowing()
        } catch {
            let block = OnlineInventoryStore.blockReason(for: error)
            if block == .appTooOld { try replica.markChangesAwaitingCatalogueNeedAppUpdate() }
            return block == nil ? .retryLater : .blocked
        }
        try replica.moveChangesAwaitingCatalogue()
        return nil
    }
}

import AppCore

extension InventoryDrain {
    func reachabilityWatcher(
        _ reachability: any NetworkReachability, startedSatisfied: Bool
    ) -> Task<Void, Never> {
        Task { [weak self, reachability] in
            var wasSatisfied = startedSatisfied
            var isFirstUpdate = true
            for await satisfied in reachability.updates() {
                if satisfied, !wasSatisfied {
                    await self?.online.refresh()
                    self?.request()
                } else if isFirstUpdate, satisfied {
                    self?.request()
                }
                wasSatisfied = satisfied
                isFirstUpdate = false
            }
        }
    }
}

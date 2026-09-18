import AppCore
import Testing

/// ADR-002's iOS replica design fixes one precedence for a row's derived
/// sync state: needs attention over synchronizing over queued over saved
/// over stale, with synchronized as the silent default. These pin that
/// order rather than each fact in isolation, because the bug this guards
/// against is exactly two facts being true at once and the wrong one
/// winning.
@Suite("Inventory sync derivation order")
internal struct InventorySyncDerivationTests {
    private func facts(
        hasOpenRepair: Bool = false,
        isSynchronizing: Bool = false,
        isQueued: Bool = false,
        isSaved: Bool = false,
        replicaIsStale: Bool = false
    ) -> InventorySync.RowFacts {
        InventorySync.RowFacts(
            hasOpenRepair: hasOpenRepair, isSynchronizing: isSynchronizing, isQueued: isQueued,
            isSaved: isSaved, replicaIsStale: replicaIsStale)
    }

    @Test("nothing pending and a current replica is synchronized")
    func synchronizedIsTheDefault() {
        #expect(InventorySync.derive(from: facts()) == .synchronized)
    }

    @Test("a stale replica surfaces only when nothing else is happening to the row")
    func staleAlone() {
        #expect(InventorySync.derive(from: facts(replicaIsStale: true)) == .stale)
    }

    @Test("a saved mutation outranks a stale replica")
    func savedOutranksStale() {
        #expect(InventorySync.derive(from: facts(isSaved: true, replicaIsStale: true)) == .saved)
    }

    @Test("a queued mutation outranks a merely saved one")
    func queuedOutranksSaved() {
        #expect(
            InventorySync.derive(from: facts(isQueued: true, isSaved: true, replicaIsStale: true))
                == .queued)
    }

    @Test("synchronizing outranks queued")
    func synchronizingOutranksQueued() {
        #expect(
            InventorySync.derive(
                from: facts(isSynchronizing: true, isQueued: true, isSaved: true)) == .synchronizing
        )
    }

    @Test("an open repair outranks every other fact, including synchronizing")
    func needsAttentionOutranksEverything() {
        #expect(
            InventorySync.derive(
                from: facts(
                    hasOpenRepair: true, isSynchronizing: true, isQueued: true, isSaved: true,
                    replicaIsStale: true)) == .needsAttention
        )
    }

    @Test("prominence is silent only for saved and synchronized")
    func prominenceGroupsSavedAndSynchronizedAsSilent() {
        #expect(InventorySync.saved.prominence == .silent)
        #expect(InventorySync.synchronized.prominence == .silent)
        #expect(InventorySync.queued.prominence == .quiet)
        #expect(InventorySync.synchronizing.prominence == .quiet)
        #expect(InventorySync.stale.prominence == .visible)
        #expect(InventorySync.needsAttention.prominence == .urgent)
    }
}

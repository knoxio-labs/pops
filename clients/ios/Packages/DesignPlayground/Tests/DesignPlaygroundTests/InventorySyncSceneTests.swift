import Testing

@testable import DesignPlayground

/// What each moment of the afternoon reports, and, mostly, what it does not.
///
/// The assertion that matters is the quiet one: a phone that has been offline
/// for twenty minutes with nothing waiting reports nothing at all. Every
/// scenario in POPS-3988 is a variation on that, and a status vocabulary that
/// cannot stay silent turns ordinary use into a fault report.
@Suite("Inventory sync scenes")
@MainActor
internal struct InventorySyncSceneTests {
    @Test("offline with nothing waiting is not a state worth reporting")
    func quietOfflineIsCurrent() {
        #expect(InventorySyncScenes.offlineRead.capsuleState == .current)
        #expect(InventorySyncScenes.settled.capsuleState == .current)
    }

    @Test("offline with work waiting says how long it has been")
    func waitingWorkIsDisclosed() {
        #expect(InventorySyncScenes.queued.capsuleState == .offline(updated: "1 hour ago"))
    }

    @Test("a repair outranks whatever else the queue is doing")
    func repairsOutrankProgress() {
        #expect(InventorySyncScenes.replaying.capsuleState == .needsAttention(count: 1))
        #expect(InventorySyncScenes.repairs.capsuleState == .needsAttention(count: 5))
    }

    @Test("before any copy exists, the screen is not an empty catalogue")
    func firstRunIsItsOwnState() {
        #expect(InventorySyncScenes.firstRun.isFirstRun)
        #expect(!InventorySyncScenes.offlineRead.isFirstRun)
    }

    @Test("pending work excludes what has already landed")
    func pendingDropsWhatLanded() {
        let pending = InventorySyncScenes.replaying.pending.map(\.id)

        #expect(!pending.contains("create-crate"))
        #expect(!pending.contains("count-screws"))
        #expect(pending.contains("move-espresso"))
    }

    @Test("a relaunched phone still holds every change it recorded")
    func relaunchLosesNothing() {
        #expect(InventorySyncScenes.relaunched.pending.count == 38)
    }

    @Test("only a queue-stopping repair reaches through the default interruption rule")
    func defaultInterruptionIsNarrow() {
        let rule = InventorySyncStyle().interruption

        #expect(InventorySyncScenes.repairs.interrupting(under: rule) == nil)
        #expect(InventorySyncScenes.sessionExpired.interrupting(under: rule) != nil)
        #expect(InventorySyncScenes.storageFull.interrupting(under: rule) != nil)
    }

    @Test("the four sync surfaces are all registered and all have states")
    func surfacesAreReachable() {
        let registered = Set(Catalog.surfaces.map(\.id.description))

        for slug in ["sync", "catalogue", "repair", "lookup"] {
            #expect(registered.contains("inventory/\(slug)"), "inventory/\(slug) is unreachable")
        }
    }

    @Test("every experiment POPS-3988 opens is still open and names a registered surface")
    func experimentsAreOpenAndAnchored() {
        let registered = Set(Catalog.surfaces.map(\.id.description))
        let subjects: Set<String> = [
            "inventory/sync", "inventory/catalogue", "inventory/repair", "inventory/lookup",
        ]
        let opened = Catalog.experiments.filter { subjects.contains($0.subject.description) }

        #expect(opened.count == 5)
        for experiment in opened {
            #expect(experiment.isOpen, "\(experiment.id) was decided without a device")
            #expect(registered.contains(experiment.subject.description))
            #expect(experiment.variants.count >= 2)
        }
    }

    @Test("a variant opens on the state that answers its question")
    func variantsOpenOnTheAnsweringState() {
        let conflict = Catalog.experiments
            .first { $0.id == "inventory-sync-conflict-treatment" }

        for variant in conflict?.variants ?? [] {
            #expect(
                variant.surface.openingState?.id == "device-divergence",
                "\(variant.id) opens on a state with nothing to compare")
        }
    }
}

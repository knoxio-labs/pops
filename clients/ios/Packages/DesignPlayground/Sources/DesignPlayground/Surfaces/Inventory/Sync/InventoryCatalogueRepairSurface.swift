import SwiftUI

/// POPS-4494: a change queued on this phone that a newer catalogue left
/// behind, from the moment the server asks for newer fields to the moment
/// the change is sent or let go.
@MainActor
internal enum InventoryCatalogueRepairSurface {
    internal static let id = SurfaceID(area: "inventory", slug: "catalogue-repair")

    private typealias Fixtures = InventoryCatalogueFixtures

    internal static let surface = DesignSurface(
        id: id,
        title: "Catalogue repair",
        synopsis: "A queued change whose fields moved on: waiting, repair, settled.",
        chrome: .navigation,
        states: waitingStates + repairStates + settledStates
    )

    private static var waitingStates: [DesignState] {
        [
            syncState(
                "updating-fields", "Waiting for new fields", .updatingFields,
                InventorySyncLedger(waiting: Fixtures.heldForFields)),
            syncState(
                "moved-sending", "Moved to new fields, sending", .syncing,
                InventorySyncLedger(waiting: Fixtures.movedAndSending)),
            DesignState("app-too-old", "App too old, change waiting") {
                InventoryCatalogueAppTooOldStage()
            },
            syncState(
                "needs-attention", "Sync row", .online(lastSynced: "1 min ago"),
                InventorySyncLedger(
                    repairs: [Fixtures.shieldingArchived, InventorySyncFixtures.placement],
                    resolved: InventorySyncFixtures.resolved)),
            syncState(
                "several", "Several changes left behind", .online(lastSynced: "1 min ago"),
                InventorySyncLedger(
                    waiting: [Fixtures.cableRename, InventorySyncFixtures.screwsCounted],
                    repairs: Fixtures.several)),
            DesignState("item-notice", "Item notice") {
                InventoryItemDetailView(detail: itemWithRepair)
            },
            syncState(
                "stalled", "Change can't be read", .stuck,
                InventorySyncLedger(
                    waiting: [Fixtures.unreadable, InventorySyncFixtures.kettleDiscarded])),
        ]
    }

    private static var repairStates: [DesignState] {
        [
            repairState("field-archived", "Field archived", Fixtures.shieldingArchived),
            repairState("field-replaced", "Field replaced", Fixtures.screenReplaced),
            repairState("type-replaced", "Type replaced", Fixtures.typeReplaced),
            repairState("option-retired", "Option retired", Fixtures.optionRetired),
            repairState("now-required", "Field now required", Fixtures.nowRequired),
            repairState("fields-not-here", "Fields not on this phone", Fixtures.fieldsNotHere),
            repairState("fields-arrived", "Fields arrived", Fixtures.fieldsArrived),
            repairState(
                "blocked-after-change", "Fields changed, still archived",
                Fixtures.shieldingAfterChange),
            DesignState("edit-item", "Edit item") {
                repair(Fixtures.shieldingArchived, editing: true)
            },
            DesignState("retry-refused", "Retry refused") {
                repair(
                    Fixtures.shieldingAfterChange,
                    failure: Fixtures.shieldingAfterChange.catalogue?.retry.refusal)
            },
            DesignState("retry-too-soon", "Retry before fields arrive") {
                repair(
                    Fixtures.fieldsNotHere,
                    failure: Fixtures.fieldsNotHere.catalogue?.retry.refusal)
            },
        ]
    }

    private static var settledStates: [DesignState] {
        [
            DesignState("retried", "Retried, with Undo") {
                repair(Fixtures.fieldsArrived, resolved: true)
            },
            DesignState("let-go", "Let go, with Undo") {
                repair(Fixtures.shieldingArchived, resolved: true, keepingMine: false)
            },
            syncState(
                "settled", "Settled on Sync", .online(lastSynced: "Just now"),
                InventorySyncLedger(resolved: Fixtures.resolved), showsResolved: true),
        ]
    }

    /// The cable, with its archived-field edit still open against it.
    private static let itemWithRepair = InventoryItemDetail(
        item: InventoryFoundationItem(
            id: "cable", name: "USB-A to USB-C cable", typeName: "Cable",
            placement: .contained(location: "Study", containers: ["Office 04"]),
            sync: .needsAttention),
        photos: [
            InventoryPhoto(
                caption: "Cable", isBroken: false, imageData: SamplePhoto.data("usb-cable"))
        ],
        fields: [
            InventoryDetailField(key: "Length", value: "2 m"),
            InventoryDetailField(key: "Connector", value: "USB-C"),
        ],
        conflict: InventoryDetailConflict(
            problem: "Queued edit: Shielding was archived",
            resolution: InventoryRepairKind.catalogueChanged.fix.title)
    )

    private static func syncState(
        _ id: String, _ title: String, _ connection: InventorySyncConnection,
        _ ledger: InventorySyncLedger, showsResolved: Bool = false
    ) -> DesignState {
        DesignState(id, title) {
            InventorySyncView(connection: connection, ledger: ledger, showsResolved: showsResolved)
        }
    }

    private static func repairState(
        _ id: String, _ title: String, _ repair: InventoryRepair
    ) -> DesignState {
        DesignState(id, title) { Self.repair(repair) }
    }

    private static func repair(
        _ repair: InventoryRepair, resolved: Bool = false, keepingMine: Bool = true,
        failure: String? = nil, editing: Bool = false
    ) -> some View {
        InventoryRepairView(
            repair: repair, resolved: resolved, keepingMine: keepingMine, failure: failure,
            editing: editing
        )
        .inventoryDestinations(true)
    }
}

/// Sync with the held change still listed under the blocking sheet: the
/// newer fields need a newer app, and nothing is sent until it is updated.
private struct InventoryCatalogueAppTooOldStage: View {
    @State private var sheet: InventorySyncInterruption? = .appTooOld

    var body: some View {
        InventorySyncView(
            connection: .online(lastSynced: "1 min ago"),
            ledger: InventorySyncLedger(waiting: InventoryCatalogueFixtures.heldForApp)
        )
        .sheet(item: $sheet) { InventoryBlockingSheet(interruption: $0) }
    }
}

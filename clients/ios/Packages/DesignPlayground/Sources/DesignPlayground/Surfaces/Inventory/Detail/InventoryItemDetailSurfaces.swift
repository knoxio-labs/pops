/// The item detail surface POPS-3980 asks for, in every state it has to
/// survive.
internal enum InventoryItemDetailStaging {
    @MainActor
    internal static func surface(opening: String = "rich", synopsis: String? = nil) -> DesignSurface
    {
        let all = states()
        let ordered = all.filter { $0.id == opening } + all.filter { $0.id != opening }
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "item-detail"),
            title: "Item detail",
            synopsis: synopsis,
            chrome: .navigation,
            states: ordered
        )
    }

    @MainActor
    private static func states() -> [DesignState] {
        [
            state(
                "sparse", "Sparse, filed after the fact", InventoryItemDetailFixtures.sparse),
            state("rich", "Richly documented", InventoryItemDetailFixtures.rich),
            state("grouped", "A grouped record", InventoryItemDetailFixtures.grouped),
            state("container", "Container-capable", InventoryItemDetailFixtures.container),
            state(
                "direct-location", "In a room directly",
                InventoryItemDetailFixtures.directLocation),
            state("contained", "Inside a container", InventoryItemDetailFixtures.contained),
            state("in-hand", "In hand", InventoryItemDetailFixtures.inHand),
            state("discarded", "Discarded", InventoryItemDetailFixtures.discarded),
            state("lost", "Lost", InventoryItemDetailFixtures.lost),
            state("destroyed", "Destroyed", InventoryItemDetailFixtures.destroyed),
            state("queued-edit", "Queued local edit", InventoryItemDetailFixtures.queuedEdit),
            state("stale", "Stale server copy", InventoryItemDetailFixtures.stale),
            state(
                "missing-paperless", "Paperless unreachable",
                InventoryItemDetailFixtures.missingPaperless),
            state("broken-photo", "A broken photo", InventoryItemDetailFixtures.brokenPhoto),
            state("no-provenance", "No provenance", InventoryItemDetailFixtures.noProvenance),
            state("large-values", "Long text and many values", InventoryItemDetailFixtures.largeValues),
            state(
                "conflicting-change", "Conflicting change",
                InventoryItemDetailFixtures.conflicting),
            DesignState("loading", "Loading") { InventoryItemDetailSkeleton() },
        ]
    }

    @MainActor
    private static func state(_ id: String, _ title: String, _ detail: InventoryItemDetail)
        -> DesignState
    {
        DesignState(id, title) { InventoryItemDetailView(detail: detail) }
    }
}

internal enum InventoryItemDetailSurfaces {
    @MainActor internal static let detail = InventoryItemDetailStaging.surface(
        synopsis:
            "Identity, placement, provenance, media and the verbs this item's capabilities allow."
    )

    @MainActor internal static let surfaces: [DesignSurface] = [detail]
}

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
            state("documents", "Documents in every state", documentStates),
            state(
                "missing-paperless", "Paperless unreachable",
                InventoryItemDetailFixtures.missingPaperless),
            state("broken-photo", "A broken photo", InventoryItemDetailFixtures.brokenPhoto),
            state("no-provenance", "No provenance", InventoryItemDetailFixtures.noProvenance),
            state(
                "large-values", "Long text and many values",
                InventoryItemDetailFixtures.largeValues),
            state("subtype-detail", "A subtype item", subtype),
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

    /// Every row the Documents section draws: linked, missing from
    /// Paperless, still processing, and refused.
    private static let documentStates = InventoryItemDetail(
        item: InventoryItemDetailFixtures.missingPaperless.item,
        documents: .linked([
            InventoryDocumentLine("Warranty card", symbol: "checkmark.seal"),
            InventoryDocumentLine("Manual", symbol: "book.closed", status: .missing),
            InventoryDocumentLine("Scan.pdf", status: .processing),
            InventoryDocumentLine(
                "Invoice", status: .failed(reason: "Paperless could not read it")),
        ]))

    private static let subtype = InventoryItemDetail(
        item: InventoryFoundationItem(
            id: "pillowcase", name: "Linen pillowcase", typeName: "Pillowcase",
            placement: .direct(location: "Guest room")),
        fields: [
            InventoryDetailField(key: "Destination", value: "Guest room"),
            InventoryDetailField(key: "Material", value: "Cotton"),
            InventoryDetailField(key: "Colour", value: "White"),
            InventoryDetailField(key: "Pattern", value: "Plain"),
            InventoryDetailField(key: "Pillow size", value: "Standard"),
            InventoryDetailField(key: "Closure", value: "Envelope"),
        ]
    )
}

internal enum InventoryItemDetailSurfaces {
    @MainActor internal static let detail = InventoryItemDetailStaging.surface(
        synopsis:
            "Identity, placement, provenance, media and the verbs this item's capabilities allow."
    )

    @MainActor internal static let surfaces: [DesignSurface] = [detail]
}

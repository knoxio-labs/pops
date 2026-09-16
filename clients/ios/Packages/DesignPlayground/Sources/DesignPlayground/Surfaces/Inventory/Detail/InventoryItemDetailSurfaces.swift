import SwiftUI

/// The item detail surface POPS-3980 asks for, staged under a given style.
///
/// Every experiment variant builds through here with one knob turned, the
/// same shape ``InventoryFoundationStaging`` uses, so the only difference
/// between two variants of one question is that knob.
internal enum InventoryItemDetailStaging {
    @MainActor
    internal static func surface(
        style: InventoryItemDetailStyle,
        opening: String = "rich",
        synopsis: String? = nil
    ) -> DesignSurface {
        let all = states(for: style)
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
    private static func states(for style: InventoryItemDetailStyle) -> [DesignState] {
        [
            state(
                "sparse", "Sparse, filed after the fact", InventoryItemDetailFixtures.sparse, style),
            state("rich", "Richly documented", InventoryItemDetailFixtures.rich, style),
            state("grouped", "A grouped record", InventoryItemDetailFixtures.grouped, style),
            state("container", "Container-capable", InventoryItemDetailFixtures.container, style),
            state(
                "direct-location", "In a room directly", InventoryItemDetailFixtures.directLocation,
                style),
            state("contained", "Inside a container", InventoryItemDetailFixtures.contained, style),
            state("in-hand", "In hand", InventoryItemDetailFixtures.inHand, style),
            state("discarded", "Discarded", InventoryItemDetailFixtures.discarded, style),
            state("lost", "Lost", InventoryItemDetailFixtures.lost, style),
            state("destroyed", "Destroyed", InventoryItemDetailFixtures.destroyed, style),
            state(
                "queued-edit", "Queued local edit", InventoryItemDetailFixtures.queuedEdit, style),
            state("stale", "Stale server copy", InventoryItemDetailFixtures.stale, style),
            state(
                "missing-paperless", "Paperless unreachable",
                InventoryItemDetailFixtures.missingPaperless,
                style),
            state("broken-photo", "A broken photo", InventoryItemDetailFixtures.brokenPhoto, style),
            state(
                "no-provenance", "No provenance", InventoryItemDetailFixtures.noProvenance, style),
            state(
                "conflicting-change", "Conflicting change", InventoryItemDetailFixtures.conflicting,
                style),
        ]
    }

    @MainActor
    private static func state(
        _ id: String, _ title: String, _ detail: InventoryItemDetail,
        _ style: InventoryItemDetailStyle
    ) -> DesignState {
        DesignState(id, title) {
            InventoryItemDetailView(detail: detail)
                .environment(\.inventoryItemDetailStyle, style)
        }
    }
}

internal enum InventoryItemDetailSurfaces {
    @MainActor internal static let detail = InventoryItemDetailStaging.surface(
        style: InventoryItemDetailStyle(),
        synopsis:
            "Identity, placement, provenance, media and the one action a placement makes obvious."
    )

    @MainActor internal static let surfaces: [DesignSurface] = [detail]
}

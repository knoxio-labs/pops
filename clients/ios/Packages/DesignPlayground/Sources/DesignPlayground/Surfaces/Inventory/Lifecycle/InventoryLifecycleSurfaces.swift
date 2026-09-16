import SwiftUI

/// The surfaces POPS-3989's experiments are about, staged under a given
/// style. Same shape as ``InventoryFoundationStaging``: every variant builds
/// through here with one knob turned, so the only difference between two
/// variants of one question is that knob.
internal enum InventoryLifecycleStaging {
    @MainActor
    internal static func gallery(
        style: InventoryLifecycleStyle,
        opening: String = "default",
        synopsis: String? = nil
    ) -> DesignSurface {
        let all = galleryStates(for: style)
        let ordered = all.filter { $0.id == opening } + all.filter { $0.id != opening }
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "lifecycle-gallery"),
            title: "Lifecycle",
            synopsis: synopsis,
            chrome: .navigationLarge,
            states: ordered
        )
    }

    @MainActor
    internal static func timeline(
        style: InventoryLifecycleStyle,
        opening: String = "default",
        synopsis: String? = nil
    ) -> DesignSurface {
        let all = timelineStates(for: style)
        let ordered = all.filter { $0.id == opening } + all.filter { $0.id != opening }
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "history-timeline"),
            title: "History",
            synopsis: synopsis,
            chrome: .navigation,
            states: ordered
        )
    }

    @MainActor
    private static func galleryStates(for style: InventoryLifecycleStyle) -> [DesignState] {
        [
            DesignState("default", "Every state") {
                InventoryLifecycleGallery().environment(\.inventoryLifecycleStyle, style)
            },
            DesignState("discard-single", "Discarding one") {
                InventoryLifecycleActionSheet(item: InventoryFoundationFixtures.television)
                    .environment(\.inventoryLifecycleStyle, style)
            },
            DesignState("discard-group", "Discarding some of a group") {
                InventoryLifecycleActionSheet(item: InventoryLifecycleFixtures.paintCans)
                    .environment(\.inventoryLifecycleStyle, style)
            },
        ]
    }

    @MainActor
    private static func timelineStates(for style: InventoryLifecycleStyle) -> [DesignState] {
        [
            DesignState("default", "Timeline") {
                InventoryLifecycleTimelineList(events: InventoryLifecycleFixtures.timeline)
                    .environment(\.inventoryLifecycleStyle, style)
            },
            DesignState("event-detail", "One event, in full") {
                InventoryLifecycleEventDetail(event: InventoryLifecycleFixtures.timeline[0])
                    .environment(\.inventoryLifecycleStyle, style)
            },
        ]
    }
}

internal enum InventoryLifecycleSurfaces {
    @MainActor internal static let gallery = InventoryLifecycleStaging.gallery(
        style: InventoryLifecycleStyle(),
        synopsis:
            "Disposition, restore, history and reversibility, as POPS-3989 leaves them open.")

    @MainActor internal static let timeline = InventoryLifecycleStaging.timeline(
        style: InventoryLifecycleStyle(),
        synopsis: "The movement and lifecycle history one item builds up.")

    @MainActor internal static let surfaces: [DesignSurface] = [gallery, timeline]
}

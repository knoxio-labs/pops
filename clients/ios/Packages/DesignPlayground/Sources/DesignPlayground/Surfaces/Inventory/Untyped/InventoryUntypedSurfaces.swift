import SwiftUI

/// The four surfaces POPS-4016's experiments are about, each staged under a
/// given style.
///
/// Same arrangement as ``InventoryFoundationStaging``: every variant builds
/// its surface through here with one knob turned, and `opening` names the
/// state a variant lands on, because an experiment shows a variant's opening
/// state and nothing else.
internal enum InventoryUntypedStaging {
    /// Where a surface sits and what it is called, so the staging helper takes
    /// one argument for the three of them rather than three.
    private struct Page {
        let id: SurfaceID
        let title: String
        let synopsis: String?
    }

    @MainActor
    internal static func filing(
        style: InventoryUntypedStyle = .init(),
        opening: String = "naming",
        synopsis: String? = nil
    ) -> DesignSurface {
        surface(
            Page(
                id: SurfaceID(area: "inventory", slug: "untyped-filing"),
                title: "Filing without a type", synopsis: synopsis),
            style: style, opening: opening,
            states: InventoryFilingStep.allCases.map { step in
                DesignState(step.rawValue, step.title) { InventoryFilingView(step: step) }
            })
    }

    @MainActor
    internal static func item(
        style: InventoryUntypedStyle = .init(),
        opening: String = "detail",
        synopsis: String? = nil
    ) -> DesignSurface {
        surface(
            Page(
                id: SurfaceID(area: "inventory", slug: "untyped-item"),
                title: "An untyped item", synopsis: synopsis),
            style: style, opening: opening,
            states: [
                DesignState("detail", "Its own screen") {
                    InventoryUntypedDetailView(entry: InventoryUntypedFixtures.canvasBag)
                },
                DesignState("in-a-list", "Beside typed items") { InventoryUntypedListView() },
                DesignState("search", "Search across both") { InventoryUntypedSearchView() },
                DesignState("one-off", "Kept untyped on purpose") {
                    InventoryUntypedDetailView(entry: InventoryUntypedFixtures.sextant)
                },
                DesignState("partial", "A type arrived for it") { InventoryPartialTypingView() },
            ])
    }

    @MainActor
    internal static func waiting(
        style: InventoryUntypedStyle = .init(),
        opening: String = "full",
        synopsis: String? = nil
    ) -> DesignSurface {
        surface(
            Page(
                id: SurfaceID(area: "inventory", slug: "untyped-waiting"),
                title: "Waiting for a type", synopsis: synopsis),
            style: style, opening: opening,
            states: [
                DesignState("full", "Eleven waiting") {
                    InventoryWaitingQueueView(state: .full)
                },
                DesignState("empty", "Nothing waiting") {
                    InventoryWaitingQueueView(state: .empty)
                },
                DesignState("kept", "Only what was kept untyped") {
                    InventoryWaitingQueueView(state: .kept)
                },
            ])
    }

    @MainActor
    internal static func arrival(
        style: InventoryUntypedStyle = .init(),
        opening: String = "arrived",
        synopsis: String? = nil
    ) -> DesignSurface {
        surface(
            Page(
                id: SurfaceID(area: "inventory", slug: "type-arrival"),
                title: "A type arriving", synopsis: synopsis),
            style: style, opening: opening,
            states: InventoryArrivalStep.allCases.map { step in
                DesignState(step.rawValue, step.title) { InventoryTypeArrivalView(step: step) }
            })
    }

    @MainActor
    private static func surface(
        _ page: Page,
        style: InventoryUntypedStyle,
        opening: String,
        states: [DesignState]
    ) -> DesignSurface {
        let styled = states.map { state in
            DesignState(state.id, state.title) {
                state.build().environment(\.inventoryUntypedStyle, style)
            }
        }
        let ordered = styled.filter { $0.id == opening } + styled.filter { $0.id != opening }
        return DesignSurface(
            id: page.id, title: page.title, synopsis: page.synopsis, chrome: .navigation,
            states: ordered)
    }
}

internal enum InventoryUntypedSurfaces {
    @MainActor internal static let filing = InventoryUntypedStaging.filing(
        synopsis:
            "Filing something no type covers, from the search that fails to what the note ends up "
            + "holding. What it captures is open.")

    @MainActor internal static let item = InventoryUntypedStaging.item(
        synopsis:
            "An untyped item on its own screen, in a list of typed ones, and in search. How "
            + "visible it should be is open.")

    @MainActor internal static let waiting = InventoryUntypedStaging.waiting(
        synopsis:
            "The eleven things waiting for a type, empty, and the one kept untyped on purpose. "
            + "Whether this is a place at all is open.")

    @MainActor internal static let arrival = InventoryUntypedStaging.arrival(
        synopsis:
            "The 2.4 update shipping a Bag type, the review it prompts, and a type that changed "
            + "under items already on it.")

    @MainActor internal static let surfaces: [DesignSurface] = [filing, item, waiting, arrival]
}

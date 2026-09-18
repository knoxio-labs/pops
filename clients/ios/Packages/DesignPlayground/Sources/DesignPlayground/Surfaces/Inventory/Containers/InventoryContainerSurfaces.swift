import SwiftUI

/// The container screens POPS-3986 asks for, in every state each has to
/// survive.
@MainActor
internal enum InventoryContainerSurfaces {
    private typealias Fixtures = InventoryContainerFixtures

    internal static let pageID = SurfaceID(area: "inventory", slug: "container-detail")
    internal static let openID = SurfaceID(area: "inventory", slug: "open-containers")

    internal static let page = DesignSurface(
        id: pageID,
        title: "Container",
        synopsis: "The item page, with its container verbs and a Contents section.",
        chrome: .navigation,
        states: [
            pageState("few", "A few items, open", Fixtures.few),
            pageState("empty", "Empty", Fixtures.empty),
            pageState("many", "Many items", Fixtures.many),
            pageState("closed", "Closed", Fixtures.closed),
            pageState("full", "Full", Fixtures.full),
            pageState("stored", "Stored in the garage", Fixtures.stored),
            pageState("furniture", "Furniture", Fixtures.furniture),
            pageState("retired", "Retired", Fixtures.retired),
            pageState("stale", "Stale", Fixtures.stale),
            DesignState("loading", "Loading") { InventoryContainerPageSkeleton() },
            unpackingState(
                "unpacking-select", "Unpacking, three selected",
                InventoryContainerUnpacking(selection: InventorySelection(Set(fewIDs)))),
            unpackingState(
                "unpacking-moved", "Two moved, with Undo",
                InventoryContainerUnpacking(selection: InventorySelection(Set(fewIDs.prefix(2)))),
                then: .moveSelected(to: "Pantry shelf")),
            unpackingState(
                "empty-outcome", "Just emptied: Keep or Retire",
                InventoryContainerUnpacking(removed: Set(fewIDs.prefix(2))), then: .takeOutAll),
            unpackingState(
                "closed-partial", "Closed part-unpacked",
                InventoryContainerUnpacking(removed: Set(fewIDs.prefix(1))), then: .close),
        ]
    )

    internal static let browser = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "container-browser"),
        title: "Containers",
        synopsis: "Counts, the open containers, then the rest, with a filter.",
        chrome: .navigationLarge,
        states: [
            DesignState.standard { InventoryContainerBrowserView(profiles: Fixtures.all) },
            DesignState("many", "Many") {
                InventoryContainerBrowserView(profiles: Fixtures.catalogue)
            },
            DesignState("filtered", "Filtered to full") {
                InventoryContainerBrowserView(profiles: Fixtures.catalogue, filter: .full)
            },
            DesignState("filtered-empty", "Filter matches nothing") {
                InventoryContainerBrowserView(
                    profiles: [Fixtures.few, Fixtures.many], filter: .retired)
            },
            DesignState("searching", "Searching") {
                InventoryContainerBrowserView(profiles: Fixtures.catalogue, query: "kit")
            },
            DesignState("empty", "No containers") {
                InventoryContainerBrowserView(profiles: [])
            },
            DesignState("loading", "Loading") { InventoryContainerBrowserSkeleton() },
        ]
    )

    internal static let openContainers = DesignSurface(
        id: openID,
        title: "Open containers",
        synopsis: "The dashboard's open-containers panel, full screen. Swipe to close.",
        chrome: .navigationLarge,
        states: [
            DesignState.standard { InventoryOpenContainersView(containers: Fixtures.all) },
            DesignState("one", "One open") {
                InventoryOpenContainersView(containers: [Fixtures.few])
            },
            DesignState("empty", "None open") {
                InventoryOpenContainersView(containers: [Fixtures.closed])
            },
            DesignState("loading", "Loading") { InventoryOpenContainersSkeleton() },
        ]
    )

    internal static let storeHere = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "container-store"),
        title: "Store here",
        synopsis: "A new item placed here, or existing items put in.",
        chrome: .bare,
        states: [
            storeState("choice", "Choice", step: .choice),
            storeState("new-item", "New item", step: .newItem),
            storeState("existing", "Existing item", step: .existing),
            storeState("existing-search", "Searching", step: .existing, query: "cable"),
            storeState(
                "existing-selected", "Two picked", step: .existing,
                selected: ["television", "tape"]),
            storeState("existing-none", "No matches", step: .existing, query: "piano"),
        ]
    )

    internal static let surfaces: [DesignSurface] = [page, browser, openContainers, storeHere]

    private static func pageState(
        _ id: String, _ title: String, _ profile: InventoryContainerProfile
    ) -> DesignState {
        DesignState(id, title) { InventoryContainerPage(profile: profile) }
    }

    private static var fewIDs: [String] { Fixtures.few.contents.entries.map(\.id) }

    private static func unpackingState(
        _ id: String, _ title: String, _ start: InventoryContainerUnpacking,
        then: InventoryContainerUnpackingStage.Then? = nil
    ) -> DesignState {
        DesignState(id, title) {
            InventoryContainerPage(
                profile: Fixtures.few,
                unpacking: InventoryContainerUnpackingStage(start: start, then: then)
            )
            .defaultScrollAnchor(.bottom)
        }
    }

    private static func storeState(
        _ id: String, _ title: String, step: InventoryStoreHereStep, query: String = "",
        selected: Set<String> = []
    ) -> DesignState {
        DesignState(id, title) {
            NavigationStack {
                InventoryContainerPage(profile: Fixtures.few)
                    .sheet(isPresented: .constant(true)) {
                        InventoryStoreHereSheet(
                            target: .container(Fixtures.few), step: step, query: query,
                            selected: selected)
                    }
            }
        }
    }
}

import SwiftUI

/// The Locations screens POPS-3985 asks for, in every state each has to
/// survive.
@MainActor
internal enum InventoryLocationSurfaces {
    private typealias Fixtures = InventoryLocationFixtures

    internal static let browserID = SurfaceID(area: "inventory", slug: "location-browser")
    internal static let pageID = SurfaceID(area: "inventory", slug: "location-detail")
    internal static let pickerID = SurfaceID(area: "inventory", slug: "location-picker")
    internal static let createID = SurfaceID(area: "inventory", slug: "location-create")

    internal static let browser = DesignSurface(
        id: browserID,
        title: "Locations",
        synopsis: "Counts, a search, then the top-level places. A place opens its own page.",
        chrome: .navigationLarge,
        states: [
            DesignState.standard { InventoryLocationBrowserView(tree: Fixtures.home) },
            DesignState("one-root", "One root, still being set up") {
                InventoryLocationBrowserView(tree: Fixtures.newHome)
            },
            DesignState("empty", "No places") {
                InventoryLocationBrowserView(tree: Fixtures.empty)
            },
            DesignState("searching", "Searching") {
                InventoryLocationBrowserView(tree: Fixtures.home, query: "shel")
            },
            DesignState("search-empty", "Search matches nothing") {
                InventoryLocationBrowserView(tree: Fixtures.home, query: "attic")
            },
            DesignState("offline", "Offline") {
                InventoryLocationBrowserView(
                    tree: Fixtures.home, offline: "Offline · updated 2 h ago")
            },
            DesignState("loading", "Loading") { InventoryLocationBrowserSkeleton() },
        ]
    )

    internal static let page = DesignSurface(
        id: pageID,
        title: "Location",
        synopsis: "A place's path, verbs, places inside, and what is directly here or in boxes.",
        chrome: .navigation,
        states: [
            pageState("room", "Room with places inside", "kitchen"),
            pageState("leaf", "Shelf with items", "pantry-shelf"),
            pageState("deep", "Deep path", "parts-drawer"),
            DesignState("empty", "Empty") {
                InventoryLocationPage(tree: Fixtures.newHome, locationID: "new-kitchen")
            },
            DesignState("delete", "Deleting a place with things in it") {
                InventoryLocationPage(
                    tree: Fixtures.home, locationID: "pantry-shelf", deleting: true)
            },
            DesignState("store-here", "Store here") {
                InventoryLocationPage(tree: Fixtures.home, locationID: "kitchen", task: .store)
            },
            DesignState("queued-move", "Move waiting to sync") {
                InventoryLocationPage(
                    tree: Fixtures.home, locationID: "garage",
                    notice: .queuedMove(to: "Self-storage"))
            },
            DesignState("conflict", "Moved elsewhere on another device") {
                InventoryLocationPage(
                    tree: Fixtures.home, locationID: "study",
                    notice: .conflictingMove(mine: "Home", theirs: "Mum's house", device: "iPad"))
            },
            DesignState("loading", "Loading") { InventoryLocationPageSkeleton() },
        ]
    )

    internal static let picker = DesignSurface(
        id: pickerID,
        title: "Choose a place",
        synopsis: "The one placement picker: recents, open containers, then places, drilled.",
        chrome: .bare,
        states: [
            pickerState("default", "Moving an item"),
            pickerState(
                "searching", "Searching", state: InventoryDestinationPickerState(query: "cup")),
            pickerState(
                "drilled", "Inside a room",
                state: InventoryDestinationPickerState(
                    path: ["kitchen"],
                    selection: place("pantry-shelf"))),
            pickerState(
                "creating", "Adding a place inline",
                state: InventoryDestinationPickerState(path: ["garage"], drafting: "Bike hooks")),
            DesignState("put-back", "From the item in hand") {
                sheet {
                    InventoryDestinationPickerSheet(
                        title: "Passport", commitTitle: "Place", tree: Fixtures.home,
                        putBack: InventoryDestination(
                            id: "put-back", name: "Put back", kind: .putBack,
                            detail: "Bedroom › Chest of drawers"),
                        recent: recent, containers: Fixtures.openContainers)
                }
            },
            DesignState("move-place", "Moving a place") {
                sheet {
                    InventoryDestinationPickerSheet(
                        title: "Garage", tree: Fixtures.home,
                        offered: Fixtures.home.reparentTargets(for: "garage"),
                        effect: { Fixtures.home.moveEffect(of: "garage", to: $0.id) },
                        state: InventoryDestinationPickerState(
                            selection: place("self-storage")))
                }
            },
            pickerState(
                "loading", "Loading", state: InventoryDestinationPickerState(isLoading: true)),
        ]
    )

    internal static let create = DesignSurface(
        id: createID,
        title: "New place",
        synopsis: "A name, a kind, and the place it sits inside.",
        chrome: .bare,
        states: [
            createState("blank", "Blank") { InventoryLocationCreateSheet(tree: Fixtures.home) },
            createState("filled", "Filled") {
                InventoryLocationCreateSheet(
                    tree: Fixtures.home, parentID: "garage", name: "Bike hooks", kind: .shelf)
            },
            createState("validation", "Name missing") {
                InventoryLocationCreateSheet(
                    tree: Fixtures.home, parentID: "kitchen", showsValidation: true)
            },
        ]
    )

    internal static let surfaces: [DesignSurface] = [browser, page, picker, create]

    private static func place(_ id: String) -> InventoryDestination? {
        Fixtures.home.node(id).map { InventoryDestination(place: $0, in: Fixtures.home) }
    }

    private static var recent: [InventoryDestination] {
        Fixtures.recentIDs.compactMap { Fixtures.home.node($0) }
            .map { InventoryDestination(place: $0, in: Fixtures.home) }
    }

    private static func pageState(_ id: String, _ title: String, _ locationID: String)
        -> DesignState
    {
        DesignState(id, title) {
            InventoryLocationPage(tree: Fixtures.home, locationID: locationID)
        }
    }

    private static func pickerState(
        _ id: String, _ title: String,
        state: InventoryDestinationPickerState = InventoryDestinationPickerState()
    ) -> DesignState {
        DesignState(id, title) {
            sheet {
                InventoryDestinationPickerSheet(
                    title: "Espresso machine", tree: Fixtures.home, recent: recent,
                    containers: Fixtures.openContainers, state: state)
            }
        }
    }

    private static func createState(
        _ id: String, _ title: String, @ViewBuilder content: @escaping () -> some View
    ) -> DesignState {
        DesignState(id, title) {
            NavigationStack {
                InventoryLocationBrowserView(tree: Fixtures.home)
                    .sheet(isPresented: .constant(true)) { content() }
            }
        }
    }

    private static func sheet(@ViewBuilder content: @escaping () -> some View) -> some View {
        NavigationStack {
            InventoryLocationPage(tree: Fixtures.home, locationID: "living-room")
                .sheet(isPresented: .constant(true)) { content() }
        }
    }
}

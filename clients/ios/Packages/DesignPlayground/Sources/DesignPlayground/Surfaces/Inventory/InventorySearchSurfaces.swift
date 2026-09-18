import SwiftUI

/// POPS-3982's surfaces: Search in the tab shell, the Items browser, and the
/// shared scanner.
@MainActor
internal enum InventorySearchSurfaces {
    internal static let searchID = SurfaceID(area: "inventory", slug: "search")

    internal static let search = DesignSurface(
        id: searchID,
        title: "Search",
        synopsis: "The search tab: recents, then one ranked list as you type.",
        chrome: .bare,
        states: [
            searchState("empty", "Recents", InventorySearchStage()),
            searchState("typing", "Results", InventorySearchStage(query: "gar")),
            searchState("code", "Matched by code", InventorySearchStage(query: "b4")),
            searchState("no-results", "No results", InventorySearchStage(query: "xylophone")),
            searchState(
                "filtered", "Filtered",
                InventorySearchStage(
                    query: "gar", filter: InventorySearchFilter(placement: .contained))),
            searchState(
                "filter-sheet", "Filter sheet",
                InventorySearchStage(
                    query: "gar", filter: InventorySearchFilter(placement: .contained),
                    showsFilters: true)),
            searchState(
                "inactive", "Including inactive",
                InventorySearchStage(
                    query: "o", filter: InventorySearchFilter(includesInactive: true))),
            searchState(
                "offline", "Offline, some stale",
                InventorySearchStage(query: "ca", staleIDs: InventorySearchFixtures.offlineStale)),
            searchState("loading", "Loading", InventorySearchStage(query: "gar", phase: .loading)),
            searchState(
                "first-launch", "First launch", InventorySearchStage(phase: .firstLaunch)),
        ]
    )

    internal static let items = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "items"),
        title: "Items",
        synopsis: "Counts, the search with filter and add, then every item.",
        chrome: .navigationLarge,
        states: [
            DesignState.standard { InventoryItemsBrowserView() },
            DesignState("selecting", "Two selected") {
                InventoryItemsBrowserView(selected: firstItems(2))
            },
            DesignState("filtered", "Filtered to untyped") {
                InventoryItemsBrowserView(filter: InventorySearchFilter(missing: .type))
            },
            DesignState("inactive", "Including inactive") {
                InventoryItemsBrowserView(
                    filter: InventorySearchFilter(includesInactive: true), sort: .name)
            },
            DesignState("empty", "No items") { InventoryItemsBrowserView(records: []) },
            DesignState("loading", "Loading") { InventoryItemsBrowserSkeleton() },
            DesignState("offline", "Offline") {
                InventoryItemsBrowserView(offline: "Offline · updated 2 h ago")
            },
        ]
    )

    /// The first `count` rows the Items browser shows by default.
    private static func firstItems(_ count: Int) -> Set<String> {
        let items = InventorySearchFixtures.records.filter { $0.kind == .item }
        return Set(items.sorted { $0.addedDaysAgo < $1.addedDaysAgo }.prefix(count).map(\.id))
    }

    internal static let scan = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "scan"),
        title: "Scan",
        synopsis: "The shared POPS scanner: read, parse, route by entity type.",
        chrome: .bare,
        states: [
            DesignState.standard { InventoryScanView() },
            scanState("loading", "Resolving", .loading),
            scanState("found-item", "Found an item", "pops://inventory/items/screws"),
            scanState(
                "found-container", "Found a container", "pops://inventory/containers/kitchen-12"),
            scanState("found-location", "Found a location", "pops://inventory/locations/garage"),
            scanState("unsupported", "Another pillar's code", "pops://purchases/orders/8841"),
            scanState("not-pops", "Not a POPS code", "https://example.com/menu"),
            scanState("target-missing", "Target missing", "pops://inventory/items/old-toaster"),
            scanState("denied", "Camera access denied", .denied),
        ]
    )

    internal static let surfaces: [DesignSurface] = [search, items, scan]

    private static func searchState(
        _ id: String, _ title: String, _ stage: InventorySearchStage
    ) -> DesignState {
        DesignState(id, title) {
            InventoryShellView(fixture: InventoryFixtures.packing, search: stage)
        }
    }

    private static func scanState(
        _ id: String, _ title: String, _ phase: InventoryScanPhase
    ) -> DesignState {
        DesignState(id, title) { InventoryScanView(phase: phase) }
    }

    private static func scanState(_ id: String, _ title: String, _ code: String) -> DesignState {
        scanState(id, title, InventoryScanRouting.phase(for: code))
    }
}

import SwiftUI

/// POPS-3982's own surfaces: search, the three complete browsers, the
/// filter/sort sheet, and the scanner with its routing screen.
@MainActor
internal enum InventorySearchSurfaces {
    internal static let search = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "search"),
        title: "Search",
        synopsis: "Find any item, container or place by name, code, type, capability or placement.",
        chrome: .navigation,
        states: [
            DesignState.standard { InventorySearchResults(query: "") },
            DesignState("typing", "Typing") { InventorySearchResults(query: "scr") },
            DesignState("loading-index", "Loading the local index") {
                InventorySearchResults(query: "screws", isIndexing: true)
            },
            DesignState("results", "Results") { InventorySearchResults(query: "screws") },
            DesignState("no-results", "No results") { InventorySearchResults(query: "xylophone") },
            DesignState("filtered-empty", "Filtered to nothing") {
                InventorySearchResults(
                    query: "screws", presetFilters: [.inHand])
            },
            DesignState("offline", "Offline") {
                InventorySearchResults(query: "router", syncState: .offline(updated: "2h ago"))
            },
            DesignState("stale", "A stale item in the results") {
                InventorySearchResults(query: "tape")
            },
            DesignState("syncing", "Synchronizing") {
                InventorySearchResults(query: "screws", syncState: .synchronizing(progress: "62%"))
            },
            DesignState("needs-attention", "Needs attention") {
                InventorySearchResults(query: "router", syncState: .needsAttention(count: 3))
            },
            DesignState("first-sync-required", "First synchronization required") {
                InventorySearchResults(query: "", isFirstRun: true)
            },
        ]
    )

    internal static let items = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "items"),
        title: "Items",
        synopsis: "The complete item catalogue.",
        chrome: .navigation,
        states: [
            DesignState.standard { InventoryRecordBrowseView(kind: .item) },
            DesignState("filtered-empty", "Filtered to nothing") {
                InventoryRecordBrowseView(kind: .item, presetFilters: [.openContainers])
            },
            DesignState("offline", "Offline") {
                InventoryRecordBrowseView(kind: .item, syncState: .offline(updated: "2h ago"))
            },
            DesignState("loading", "Loading the local index") {
                InventoryRecordBrowseView(kind: .item, isIndexing: true)
            },
        ]
    )

    internal static let containers = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "containers"),
        title: "Containers",
        synopsis: "Every open and closed container.",
        chrome: .navigation,
        states: [
            DesignState.standard { InventoryRecordBrowseView(kind: .container) },
            DesignState("offline", "Offline") {
                InventoryRecordBrowseView(kind: .container, syncState: .offline(updated: "2h ago"))
            },
        ]
    )

    internal static let locations = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "locations"),
        title: "Locations",
        synopsis: "The complete place hierarchy.",
        chrome: .navigation,
        states: [
            DesignState.standard { InventoryLocationsBrowseView() },
            DesignState("loading", "Loading the local index") {
                InventoryLocationsBrowseView(isIndexing: true)
            },
        ]
    )

    internal static let searchFilters = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "search-filters"),
        title: "Filter and sort",
        synopsis: "Every filter the ticket names, grouped, over the results being narrowed.",
        chrome: .sheet,
        states: [
            DesignState.standard {
                InventorySearchFilterSheet(
                    activeFilters: .constant([.openContainers]), sort: .constant(.relevance))
            }
        ],
        backdrop: { InventorySearchResults(query: "garage") }
    )

    internal static let scan = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "scan"),
        title: "Scan",
        synopsis: "The general POPS scanner: shared routing, not an Inventory-only parser.",
        chrome: .navigation,
        states: [
            DesignState.standard { InventoryScanView() },
            DesignState("undetermined", "Camera permission undecided") {
                InventoryScanView(access: .undetermined)
            },
            DesignState("denied", "Camera access denied") { InventoryScanView(access: .denied) },
            DesignState("restricted", "Camera access restricted") {
                InventoryScanView(access: .restricted)
            },
            DesignState("unavailable", "No camera on this device") {
                InventoryScanView(access: .unavailable)
            },
            DesignState("invalid-qr", "Invalid QR") {
                InventoryScanView(outcome: .malformed)
            },
            DesignState("recognized-unsupported", "Recognized, unsupported pillar") {
                InventoryScanView(outcome: .recognized(.otherPillar(name: "finance")))
            },
        ]
    )

    internal static let scanResult = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "scan-result"),
        title: "Scan result",
        synopsis: "What a scan passes through before a screen opens, and what stops there.",
        chrome: .navigation,
        states: [
            DesignState.standard { InventoryScanResultView(state: .loading) },
            DesignState("target-missing", "Target missing") {
                InventoryScanResultView(state: .targetMissing)
            },
            DesignState("stale-local-result", "Stale local result") {
                InventoryScanResultView(state: .staleLocalResult)
            },
            DesignState("first-sync-required", "First synchronization required") {
                InventoryScanResultView(state: .firstSyncRequired)
            },
            DesignState("destination-unavailable", "Deep-link destination unavailable") {
                InventoryScanResultView(state: .destinationUnavailable(pillar: "media"))
            },
        ]
    )

    internal static let surfaces: [DesignSurface] = [
        search, items, containers, locations, searchFilters, scan, scanResult,
    ]
}

/// What the universal search opens with, so each staged state is one value.
internal struct UniversalSearchStage {
    internal var query = ""
    internal var scope = SearchScope.all
    internal var answers: [SearchPillar: SearchAnswer] = [:]
    internal var inventoryFilter = InventorySearchFilter()
    internal var purchasesFilter = PurchasesSearchFilter()
    /// Records whose local copy may be behind, drawn with their stale mark.
    internal var staleIDs: Set<String> = []
    internal var recents = UniversalSearchFixtures.recents
    internal var scanned = InventorySearchFixtures.recentlyScanned
    internal var showsFilters = false
    /// A purchase already opened from the results, for the state that
    /// reviews where a tap lands.
    internal var opened: SearchRoute?

    /// A phone that has never downloaded Inventory: nothing searched, nothing
    /// scanned, and Purchases the only pillar that can answer.
    internal static let firstLaunch = UniversalSearchStage(
        answers: [.inventory: .notOnPhone], recents: [], scanned: [])

    /// The phone with no connection: Inventory answers from its replica,
    /// Purchases knows before asking that it cannot.
    internal static func offline(
        query: String, scope: SearchScope = .all, staleIDs: Set<String> = []
    ) -> UniversalSearchStage {
        UniversalSearchStage(
            query: query, scope: scope, answers: [.purchases: .offline], staleIDs: staleIDs)
    }
}

internal enum UniversalSearchFixtures {
    internal static let recents: [SearchRecent] = [
        SearchRecent(query: "screws"),
        SearchRecent(query: "total tools", scope: .pillar(.purchases)),
        SearchRecent(query: "office 04", scope: .pillar(.inventory)),
        SearchRecent(query: "hdmi"),
    ]
}

import AppCore
import FeatureInventory
import FeaturePurchases
import Foundation
import Observation

/// Composes one search over every pillar this app can search: the app is the
/// only place that knows both Inventory and Purchases, so it is the only
/// place that can own one model per pillar and ask them together.
///
/// Generic over each pillar's provider so a test can script one with
/// ``ScriptedSearchProvider`` while the app wires the real
/// `InventorySearchProvider` and `PurchasesSearchProvider`.
@MainActor
@Observable
public final class AppSearchModel<
    InventoryProvider: SearchProvider,
    PurchasesProvider: SearchProvider
>
where
    InventoryProvider.Filter == InventorySearchFilter,
    PurchasesProvider.Filter == PurchasesSearchFilter
{
    /// Rows are capped to this many per pillar while the scope is All.
    public static var allCap: Int { 3 }

    /// The text every available pillar is asked with.
    public var query = "" {
        didSet { askAll() }
    }

    /// Which pillar's rows are shown. Falls back to ``SearchScope/all`` the
    /// moment its pillar leaves ``available``, since a scope naming a pillar
    /// nobody can search any longer has nothing to show.
    public var scope = SearchScope.all {
        didSet { fallBackScopeIfNeeded() }
    }

    /// Narrows Inventory's rows; changing it re-asks Inventory alone.
    public var inventoryFilter = InventorySearchFilter() {
        didSet { askInventory() }
    }

    /// Narrows Purchases' rows; changing it re-asks Purchases alone.
    public var purchasesFilter = PurchasesSearchFilter() {
        didSet { askPurchases() }
    }

    /// Every pillar this model can search, in the tab bar's order.
    public private(set) var available: [SearchPillar]

    /// Inventory's model, or `nil` while Inventory is not searchable.
    public let inventory: SearchPillarModel<InventoryProvider>?

    /// Purchases' model, or `nil` while Purchases is not searchable.
    public let purchases: SearchPillarModel<PurchasesProvider>?

    /// Creates a model with one pillar model per available provider.
    ///
    /// - Parameters:
    ///   - tabOrder: Every pillar the tab bar can show, in its order. Filtered
    ///     down to the pillars a provider was supplied for.
    ///   - inventoryProvider: Inventory's provider, or `nil` when Inventory's
    ///     feature is not in `surface.available`.
    ///   - purchasesProvider: Purchases' provider, or `nil` when Purchases'
    ///     feature is not in `surface.available`.
    public init(
        tabOrder: [SearchPillar],
        inventoryProvider: InventoryProvider?,
        purchasesProvider: PurchasesProvider?
    ) {
        inventory = inventoryProvider.map(SearchPillarModel.init)
        purchases = purchasesProvider.map(SearchPillarModel.init)
        available = tabOrder.filter { pillar in
            switch pillar {
            case .inventory: inventoryProvider != nil
            case .purchases: purchasesProvider != nil
            }
        }
    }

    /// Updates which pillars are searchable, for when the app learns the BFM
    /// no longer offers one. A pillar's model is retained even once it drops
    /// out of ``available`` — nothing asks it again, but nothing tears it
    /// down mid-query either.
    public func update(available: [SearchPillar]) {
        self.available = available
        fallBackScopeIfNeeded()
    }

    /// Asks every available pillar with the current query and its own filter,
    /// whatever the scope — a pillar out of scope still answers, so its chip
    /// stays current the moment the scope widens back to it.
    public func askAll() {
        askInventory()
        askPurchases()
    }

    /// Whether every pillar in scope has answered the current query with
    /// nothing. `false` for an empty query, and `false` while any pillar in
    /// scope is still pending, failed, offline or not on the phone.
    public var hasNoResults: Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let pillars = scope.pillars(in: available)
        guard !trimmed.isEmpty, !pillars.isEmpty else { return false }
        return pillars.allSatisfy(isCurrentAndEmpty)
    }

    /// Whether a narrowing is on for any pillar the scope includes.
    public var isFiltered: Bool {
        (scope.includes(.inventory) && inventoryFilter.isActive)
            || (scope.includes(.purchases) && purchasesFilter.isActive)
    }

    /// Every active narrowing in scope, joined for the filter circle's label.
    public var filterSummary: String {
        [
            scope.includes(.inventory) ? inventoryFilter.summary : "",
            scope.includes(.purchases) ? purchasesFilter.summary : "",
        ]
        .filter { !$0.isEmpty }
        .joined(separator: ", ")
    }

    /// The compact status one pillar's scope chip shows.
    public func status(for pillar: SearchPillar) -> SearchChipStatus {
        switch pillar {
        case .inventory: inventory?.chipStatus ?? .none
        case .purchases: purchases?.chipStatus ?? .none
        }
    }

    private func isCurrentAndEmpty(_ pillar: SearchPillar) -> Bool {
        switch pillar {
        case .inventory: inventory?.answer == .current && inventory?.hits.isEmpty == true
        case .purchases: purchases?.answer == .current && purchases?.hits.isEmpty == true
        }
    }

    private func askInventory() {
        guard available.contains(.inventory) else { return }
        inventory?.ask(query, filter: inventoryFilter)
    }

    private func askPurchases() {
        guard available.contains(.purchases) else { return }
        purchases?.ask(query, filter: purchasesFilter)
    }

    private func fallBackScopeIfNeeded() {
        if case .pillar(let pillar) = scope, !available.contains(pillar) {
            scope = .all
        }
    }
}

import AppCore
import DesignSystem
import FeatureInventory
import FeaturePurchases
import FeatureSearch
import SwiftUI

/// The app's one universal search screen: every pillar `AppSearchModel`
/// found searchable, asked together, behind its own `NavigationStack`.
internal struct AppSearchTab: View {
    @Bindable private var model: AppSearchModel<InventorySearchProvider, PurchasesSearchProvider>
    private let dependencies: AppDependencies
    private let entityRouter: any EntityRouter
    @State private var path = NavigationPath()
    @State private var session: InventorySearchSession

    /// Creates the tab over an already-composed model and the same
    /// dependencies its pillars' own tabs read.
    internal init(
        model: AppSearchModel<InventorySearchProvider, PurchasesSearchProvider>,
        dependencies: AppDependencies,
        entityRouter: any EntityRouter
    ) {
        self.model = model
        self.dependencies = dependencies
        self.entityRouter = entityRouter
        _session = State(wrappedValue: InventorySearchSession(store: dependencies.inventory))
    }

    internal var body: some View {
        NavigationStack(path: $path) {
            UniversalSearchScreen(
                query: $model.query,
                scope: $model.scope,
                available: model.available,
                status: model.status(for:),
                hasNoResults: model.hasNoResults,
                isFiltered: model.isFiltered,
                filterSummary: model.filterSummary,
                scan: scan,
                onSubmit: {},
                resetFilters: resetFilters,
                sections: { sections },
                emptyContent: { EmptyView() },
                filterFields: { filterFields }
            )
            .inventorySearchDestinations(store: dependencies.inventory, entityRouter: entityRouter)
            .purchasesDestinations(dependencies: dependencies)
        }
    }

    /// Pushes Inventory's scanner, or `nil` while Inventory cannot be searched.
    private var scan: (() -> Void)? {
        guard model.available.contains(.inventory) else { return nil }
        return { path.append(InventoryScanLink()) }
    }

    @ViewBuilder private var sections: some View {
        ForEach(model.available) { pillar in
            section(for: pillar)
        }
    }

    @ViewBuilder private func section(for pillar: SearchPillar) -> some View {
        switch pillar {
        case .inventory:
            if let state = model.inventory?.section(scope: model.scope, cap: Model.allCap) {
                SearchSectionChrome(
                    pillar: .inventory,
                    summary: Self.summary(state),
                    isScoped: model.scope != .all,
                    showAll: { model.scope = .pillar(.inventory) },
                    retry: { model.inventory?.retry() },
                    download: {},
                    rows: {
                        InventorySearchRows(Self.rows(state), query: model.query, session: session)
                    }
                )
            }
        case .purchases:
            if let state = model.purchases?.section(scope: model.scope, cap: Model.allCap) {
                SearchSectionChrome(
                    pillar: .purchases,
                    summary: Self.summary(state),
                    isScoped: model.scope != .all,
                    showAll: { model.scope = .pillar(.purchases) },
                    retry: { model.purchases?.retry() },
                    download: {},
                    rows: {
                        ForEach(Self.rows(state)) { hit in
                            PurchaseSearchRow(hit: hit, query: model.query)
                        }
                    }
                )
            }
        }
    }

    @ViewBuilder private var filterFields: some View {
        ForEach(model.available) { pillar in
            switch pillar {
            case .inventory:
                InventorySearchFilterFields(filter: $model.inventoryFilter, types: []) {
                    header(.inventory)
                }
            case .purchases:
                PurchasesSearchFilterFields(filter: $model.purchasesFilter) {
                    header(.purchases)
                }
            }
        }
    }

    private func header(_ pillar: SearchPillar) -> some View {
        Label(pillar.title, systemImage: pillar.symbol)
    }

    private func resetFilters() {
        if model.available.contains(.inventory) { model.inventoryFilter = InventorySearchFilter() }
        if model.available.contains(.purchases) { model.purchasesFilter = PurchasesSearchFilter() }
    }

    private typealias Model = AppSearchModel<InventorySearchProvider, PurchasesSearchProvider>

    /// Shapes one pillar's answer for `SearchSectionChrome`, which knows
    /// nothing of `SearchPillarModel`'s own row-carrying state.
    private static func summary<Hit>(_ state: SearchSectionState<Hit>) -> SearchSectionSummary {
        switch state {
        case .results(let rows, let total, _, let isRefining):
            .results(shown: rows.count, total: total, isRefining: isRefining)
        case .loading: .loading
        case .failed: .failed
        case .offline: .offline
        case .notOnPhone: .notOnPhone
        }
    }

    /// The rows to draw, empty for any state but a results one — the chrome
    /// draws every other state's message itself, so nothing else calls this
    /// with those.
    private static func rows<Hit>(_ state: SearchSectionState<Hit>) -> [Hit] {
        guard case .results(let rows, _, _, _) = state else { return [] }
        return rows
    }
}

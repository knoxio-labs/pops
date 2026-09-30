import AppCore
import FeatureInventory
import FeaturePurchases
import FeatureSearch
import SwiftUI

/// The app's one universal search screen: every pillar `AppSearchModel`
/// found searchable, asked together, behind its own `NavigationStack`.
internal struct AppSearchTab: View {
    @Environment(\.errorPresenter) private var errorPresenter
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
            .inventorySearchChrome(
                session, records: inventoryResults, store: dependencies.inventory,
                barcodeLookup: dependencies.barcodeLookup,
                codeSuggestions: dependencies.codeSuggestions
            )
            .purchasesDestinations(dependencies: dependencies)
            .errorDiagnosticsMenu()
        }
        .task {
            await model.loadInventoryTypes()
        }
        .onChange(of: model.inventoryDownloadFailed) { _, failed in
            guard failed else { return }
            errorPresenter.present(
                PopsError(
                    code: "ios.inventory.download_failed",
                    message:
                        "Inventory could not be downloaded. Check your connection and try again.",
                    retryable: true,
                    kind: .offline),
                operation: "Download inventory",
                context: .foreground)
            model.clearInventoryDownloadFailure()
        }
    }

    /// Pushes Inventory's scanner, or `nil` while Inventory cannot be searched.
    private var scan: (() -> Void)? {
        guard model.available.contains(.inventory) else { return nil }
        return { path.append(InventoryScanLink()) }
    }

    /// Inventory's currently shown rows, for the selection bar
    /// `inventorySearchChrome` installs — empty while Inventory is
    /// unavailable or answering with anything but results.
    private var inventoryResults: [InventorySearchResult] {
        guard let state = model.inventory?.section(scope: model.scope) else {
            return []
        }
        return Self.rows(state)
    }

    @ViewBuilder private var sections: some View {
        ForEach(model.available) { pillar in
            section(for: pillar)
        }
    }

    @ViewBuilder private func section(for pillar: SearchPillar) -> some View {
        switch pillar {
        case .inventory:
            if let state = model.inventory?.section(scope: model.scope) {
                inventorySection(state)
            }
        case .purchases:
            if let state = model.purchases?.section(scope: model.scope) {
                purchasesSection(state)
            }
        }
    }

    private func inventorySection(
        _ state: SearchSectionState<InventorySearchResult>
    ) -> some View {
        SearchSectionChrome(
            pillar: .inventory,
            summary: Self.summary(state),
            pagingState: model.inventory?.pagingState ?? .idle,
            isScoped: model.scope != .all,
            showAll: { model.scope = .pillar(.inventory) },
            retry: { model.inventory?.retry() },
            retryNextPage: { Task { await model.inventory?.retryNextPage() } },
            download: { Task { await model.downloadInventory() } },
            rows: {
                InventorySearchRows(
                    Self.rows(state), query: model.query, session: session,
                    onReachEnd: {
                        Task { await model.inventory?.loadNextPageIfNeeded() }
                    })
            }
        )
    }

    private func purchasesSection(
        _ state: SearchSectionState<PurchaseSearchHit>
    ) -> some View {
        let rows = Self.rows(state)
        return SearchSectionChrome(
            pillar: .purchases,
            summary: Self.summary(state),
            pagingState: model.purchases?.pagingState ?? .idle,
            isScoped: model.scope != .all,
            showAll: { model.scope = .pillar(.purchases) },
            retry: { model.purchases?.retry() },
            retryNextPage: { Task { await model.purchases?.retryNextPage() } },
            download: {},
            rows: {
                LazyVStack(spacing: PopsSpacing.zero) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, hit in
                        PurchaseSearchRow(hit: hit, query: model.query)
                            .onAppear {
                                guard index == rows.count - 1 else { return }
                                Task { await model.purchases?.loadNextPageIfNeeded() }
                            }
                    }
                }
            }
        )
    }

    @ViewBuilder private var filterFields: some View {
        ForEach(model.available) { pillar in
            switch pillar {
            case .inventory:
                InventorySearchFilterFields(
                    filter: $model.inventoryFilter, types: model.inventoryTypes
                ) {
                    header(.inventory)
                }
            case .purchases:
                PurchasesSearchFilterFields(
                    filter: $model.purchasesFilter, repository: dependencies.purchases
                ) {
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

import AppCore
import DesignSystem
import SwiftUI

/// The shared universal-search page around caller-provided pillar sections and filters.
public struct UniversalSearchScreen<Sections: View, EmptyContent: View, FilterFields: View>: View {
    @Binding private var query: String
    @Binding private var scope: SearchScope
    private let available: [SearchPillar]
    private let status: (SearchPillar) -> SearchChipStatus
    private let hasNoResults: Bool
    private let isFiltered: Bool
    private let filterSummary: String
    private let scan: (() -> Void)?
    private let onSubmit: () -> Void
    private let resetFilters: () -> Void
    @ViewBuilder private let sections: () -> Sections
    @ViewBuilder private let emptyContent: () -> EmptyContent
    @ViewBuilder private let filterFields: () -> FilterFields
    @State private var recents: [SearchRecent]
    @State private var showingFilters = false
    private let recentsStore = SearchRecentsStore()

    /// Creates a search page whose domain rows, empty-query additions and filter fields are supplied by the caller.
    public init(
        query: Binding<String>,
        scope: Binding<SearchScope>,
        available: [SearchPillar],
        status: @escaping (SearchPillar) -> SearchChipStatus,
        hasNoResults: Bool,
        isFiltered: Bool,
        filterSummary: String,
        scan: (() -> Void)? = nil,
        onSubmit: @escaping () -> Void,
        resetFilters: @escaping () -> Void,
        @ViewBuilder sections: @escaping () -> Sections,
        @ViewBuilder emptyContent: @escaping () -> EmptyContent,
        @ViewBuilder filterFields: @escaping () -> FilterFields
    ) {
        _query = query
        _scope = scope
        self.available = available
        self.status = status
        self.hasNoResults = hasNoResults
        self.isFiltered = isFiltered
        self.filterSummary = filterSummary
        self.scan = scan
        self.onSubmit = onSubmit
        self.resetFilters = resetFilters
        self.sections = sections
        self.emptyContent = emptyContent
        self.filterFields = filterFields
        _recents = State(initialValue: SearchRecentsStore().load())
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                PopsPageTitle(title: "Search")
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    searchBar
                    SearchScopeBar(scope: $scope, available: available, status: status)
                }
                content
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollDismissesKeyboard(.immediately)
        .popsCollapsingTitle("Search")
        .popsGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .tint(scope.tint)
        .sheet(isPresented: $showingFilters) {
            UniversalSearchFilterSheet(
                isFiltered: isFiltered,
                tint: scope.tint,
                reset: resetFilters,
                fields: filterFields)
        }
        .onChange(of: recents) { _, recents in recentsStore.save(recents) }
        .popsMotion(value: query)
        .popsMotion(value: scope)
    }

    private var searchBar: some View {
        PopsSearchBar(
            query: $query,
            tint: scope.tint,
            prompt: scope.prompt,
            isFiltered: isFiltered,
            filterSummary: filterSummary,
            onFilter: { showingFilters = true },
            scan: scan,
            onSubmit: submit)
    }

    @ViewBuilder private var content: some View {
        switch UniversalSearchContentChoice(
            query: query, hasNoResults: hasNoResults, isFiltered: isFiltered)
        {
        case .recents:
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                SearchRecentsList(recents: $recents, scope: scope, onSelect: select)
                emptyContent()
            }
        case .filteredEmpty:
            PopsCentredLine(text: "No matches with these filters")
        case .queryEmpty(let query):
            PopsCentredLine(text: "No results for \u{201C}\(query)\u{201D}")
        case .sections:
            sections()
        }
    }

    private func submit() {
        recents = SearchRecentsStore.adding(query, scope: scope, to: recents)
        onSubmit()
    }

    private func select(_ recent: SearchRecent) {
        SearchRecentSelection.apply(
            recent,
            setScope: { scope = $0 },
            setQuery: { query = $0 })
    }
}

internal enum UniversalSearchContentChoice: Equatable {
    case recents
    case filteredEmpty
    case queryEmpty(String)
    case sections

    internal init(query: String, hasNoResults: Bool, isFiltered: Bool) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            self = .recents
        } else if !hasNoResults {
            self = .sections
        } else if isFiltered {
            self = .filteredEmpty
        } else {
            self = .queryEmpty(trimmed)
        }
    }
}

internal enum SearchRecentSelection {
    internal static func apply(
        _ recent: SearchRecent,
        setScope: (SearchScope) -> Void,
        setQuery: (String) -> Void
    ) {
        setScope(recent.scope)
        setQuery(recent.query)
    }
}

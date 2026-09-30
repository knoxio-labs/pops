import AppCore
import Foundation

/// One row of a universal search answer, from whichever pillar gave it.
internal enum SearchRow: Identifiable, Equatable {
    case inventory(InventorySearchHit)
    case purchases(PurchaseSearchHit)

    internal var id: String {
        switch self {
        case .inventory(let hit): "inventory-\(hit.id)"
        case .purchases(let hit): "purchases-\(hit.id)"
        }
    }

    /// The item or container this row is, for selection; nil for anything
    /// selection cannot act on.
    internal var inventoryRecordID: String? {
        guard case .inventory(.record(let match)) = self else { return nil }
        return match.record.id
    }
}

/// What one pillar's section holds.
internal enum SearchSectionContent: Equatable {
    /// `rows` are loaded bounded pages, `total` is how many match, and `query`
    /// is the query they answer, which is the previous one while `isRefining`.
    case results(
        rows: [SearchRow], total: Int, query: String, isRefining: Bool,
        paging: SearchPagingState
    )
    case loading
    case failed
    case offline
    case notOnPhone
}

internal struct SearchSection: Identifiable, Equatable {
    internal let pillar: SearchPillar
    internal let content: SearchSectionContent

    internal var id: String { pillar.id }
}

/// What a pillar's chip says beside its name.
internal enum SearchChipStatus: Equatable {
    case none
    case count(Int)
    case pending
    case failed
    case offline
    case notOnPhone
}

/// The universal search's answer to one query, pure so it can be tested
/// without a view: which pillars have a section, what each holds, and what
/// each chip says.
///
/// Each in-scope pillar answers in its own section, loading fixture matches in
/// the same bounded windows as production search. A pillar with nothing to
/// show leaves no section.
internal struct UniversalSearchModel {
    internal static let pageSize = 20

    internal var query: String
    internal var scope = SearchScope.all
    internal var answers: [SearchPillar: SearchAnswer] = [:]
    internal var loadedPageCounts: [SearchPillar: Int] = [:]
    internal var pagingStates: [SearchPillar: SearchPagingState] = [:]
    internal var inventoryRecords: [InventorySearchRecord] = InventorySearchFixtures.records
    internal var inventoryFilter = InventorySearchFilter()
    internal var purchasesFilter = PurchasesSearchFilter()
    internal var places = InventorySearchFixtures.places
    internal var purchases: [Purchase] = PurchasesSearchFixtures.purchases
    internal var lines: [PurchaseItemHit] = PurchasesSearchFixtures.items

    internal var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    internal func answer(for pillar: SearchPillar) -> SearchAnswer {
        answers[pillar] ?? .current
    }

    /// Every pillar in scope that has something to show, in tab-bar order.
    /// Empty for an empty query, and when every pillar answered with nothing.
    internal var sections: [SearchSection] {
        guard !trimmedQuery.isEmpty else { return [] }
        return scope.pillars.compactMap(section)
    }

    /// Whether every pillar in scope has answered this query and found
    /// nothing.
    internal var hasNoResults: Bool {
        !trimmedQuery.isEmpty && sections.isEmpty
    }

    /// Whether a narrowing is on for any pillar in scope.
    internal var isFiltered: Bool {
        (scope.includes(.inventory) && inventoryFilter.isActive)
            || (scope.includes(.purchases) && purchasesFilter.isActive)
    }

    internal func chipStatus(for pillar: SearchPillar) -> SearchChipStatus {
        switch answer(for: pillar) {
        case .offline: return .offline
        case .notOnPhone: return .notOnPhone
        case .failed: return trimmedQuery.isEmpty ? .none : .failed
        case .pending: return trimmedQuery.isEmpty ? .none : .pending
        case .current:
            return trimmedQuery.isEmpty ? .none : .count(rows(pillar, for: trimmedQuery).count)
        }
    }

    internal func rows(_ pillar: SearchPillar, for query: String) -> [SearchRow] {
        switch pillar {
        case .inventory:
            return inventoryHits(query).map(SearchRow.inventory)
        case .purchases:
            return PurchasesSearchEngine.search(
                query, purchases: purchases, lines: lines, filter: purchasesFilter
            ).map(SearchRow.purchases)
        }
    }

    private func section(_ pillar: SearchPillar) -> SearchSection? {
        let content: SearchSectionContent
        switch answer(for: pillar) {
        case .current:
            guard let results = results(pillar, trimmedQuery, isRefining: false) else { return nil }
            content = results
        case .pending(let previous):
            let earlier = previous?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            content =
                earlier.isEmpty
                ? .loading : results(pillar, earlier, isRefining: true) ?? .loading
        case .failed: content = .failed
        case .offline: content = .offline
        case .notOnPhone: content = .notOnPhone
        }
        return SearchSection(pillar: pillar, content: content)
    }

    private func results(
        _ pillar: SearchPillar, _ query: String, isRefining: Bool
    ) -> SearchSectionContent? {
        let all = rows(pillar, for: query)
        guard !all.isEmpty else { return nil }
        let pages = max(1, loadedPageCounts[pillar] ?? 1)
        let page = SearchFixturePage(all, loadedPageCount: pages, pageSize: Self.pageSize)
        let paging: SearchPagingState
        if isRefining || !page.hasMore {
            paging = .exhausted
        } else {
            paging = pagingStates[pillar] ?? .idle
        }
        return .results(
            rows: page.rows, total: all.count, query: query, isRefining: isRefining,
            paging: paging)
    }

    /// Items, containers and places, as Inventory's own search ranks them.
    /// Places answer only while no filter narrows the records, because no
    /// filter describes a place.
    private func inventoryHits(_ query: String) -> [InventorySearchHit] {
        let matches = InventorySearchEngine.search(query, in: inventoryRecords)
            .filter { inventoryFilter.matches($0.record) }
        var placeFilter = inventoryFilter
        placeFilter.includesInactive = false
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let matchingPlaces = placeFilter.isActive ? [] : places.matching(trimmed)
        return InventorySearchRanking.rank(query, matches: matches, places: matchingPlaces)
    }
}

internal struct SearchFixturePage<Element> {
    internal let rows: [Element]
    internal let hasMore: Bool

    internal init(_ allRows: [Element], loadedPageCount: Int, pageSize: Int) {
        let boundedPageSize = max(1, pageSize)
        let pageCount = max(1, loadedPageCount)
        let end = min(pageCount * boundedPageSize, allRows.count)
        rows = Array(allRows[..<end])
        hasMore = end < allRows.count
    }
}

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
    /// `rows` are what fits, `total` is how many there are, and `query` is
    /// the query they answer, which is the previous one while `isRefining`.
    case results(rows: [SearchRow], total: Int, query: String, isRefining: Bool)
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
/// In All, each pillar answers in its own section, capped at `allCap` rows
/// with the rest a tap on its header away, because a pillar that answers
/// later, or not at all, has to say so somewhere. A pillar with nothing to
/// show leaves no section. Scoped to one pillar, that pillar's list is whole.
internal struct UniversalSearchModel {
    internal static let allCap = 3

    internal var query: String
    internal var scope = SearchScope.all
    internal var answers: [SearchPillar: SearchAnswer] = [:]
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
        let shown = scope == .all ? Array(all.prefix(Self.allCap)) : all
        return .results(rows: shown, total: all.count, query: query, isRefining: isRefining)
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

import AppCore
import Foundation

extension InMemoryPurchasesRepository {
    public func search(
        query searchQuery: PurchaseSearchQuery, after cursor: String?, limit: Int
    ) async throws -> PurchaseSearchPage {
        let text = searchQuery.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return PurchaseSearchPage(hits: [], nextCursor: nil, totalCount: 0)
        }
        record(
            SearchCall(
                text: searchQuery.text, kind: searchQuery.kind, status: searchQuery.status,
                tags: searchQuery.tags, cursor: cursor, limit: limit))
        try beginCall()
        try await Task.sleep(for: searchDelay)
        let matchingHits = hits.filter { hit in
            searchHit(hit, matches: searchQuery.kind)
                && searchHit(hit, matches: searchQuery.status)
                && searchHit(hit, matches: text)
                && searchHit(hit, matches: searchQuery.tags)
        }
        let start = try searchOffset(for: cursor, query: searchQuery, count: matchingHits.count)
        let end = min(start + effectiveLimit(limit), matchingHits.count)
        let nextCursor =
            end < matchingHits.count
            ? mintSearchCursor(offset: end, query: searchQuery)
            : nil
        return PurchaseSearchPage(
            hits: Array(matchingHits[start..<end]), nextCursor: nextCursor,
            totalCount: cursor == nil ? matchingHits.count : nil)
    }

    public func purchaseTags(
        search: String, after cursor: String?, limit: Int
    ) async throws -> PurchaseTagPage {
        record(TagsCall(search: search, cursor: cursor, limit: limit))
        try beginCall()
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let matchingTags =
            query.isEmpty
            ? tagsInUse
            : tagsInUse.filter { $0.tag.localizedCaseInsensitiveContains(query) }
        let start = try tagOffset(for: cursor, search: query, count: matchingTags.count)
        let end = min(start + effectiveLimit(limit), matchingTags.count)
        let nextCursor =
            end < matchingTags.count
            ? mintTagsCursor(offset: end, search: query)
            : nil
        return PurchaseTagPage(
            tags: Array(matchingTags[start..<end]), nextCursor: nextCursor,
            totalCount: cursor == nil ? matchingTags.count : nil)
    }

    private func mintSearchCursor(offset: Int, query: PurchaseSearchQuery) -> String {
        let cursor = mintCursor(prefix: "purchase-search-cursor")
        mintedSearchCursors[cursor] = SearchCursorRecord(offset: offset, query: query)
        return cursor
    }

    private func mintTagsCursor(offset: Int, search: String) -> String {
        let cursor = mintCursor(prefix: "purchase-tags-cursor")
        mintedTagCursors[cursor] = TagsCursorRecord(offset: offset, search: search)
        return cursor
    }

    private func searchOffset(
        for cursor: String?, query: PurchaseSearchQuery, count: Int
    ) throws -> Int {
        guard let cursor else { return 0 }
        guard let minted = mintedSearchCursors[cursor], minted.query == query,
            minted.offset <= count
        else {
            throw RepositoryError.contractMismatch
        }
        return minted.offset
    }

    private func tagOffset(for cursor: String?, search: String, count: Int) throws -> Int {
        guard let cursor else { return 0 }
        guard let minted = mintedTagCursors[cursor], minted.search == search,
            minted.offset <= count
        else {
            throw RepositoryError.contractMismatch
        }
        return minted.offset
    }
}

private func searchHit(_ hit: PurchaseSearchHit, matches status: PurchaseSearchStatus) -> Bool {
    switch status {
    case .any: true
    case .unmatched: hit.order.status == .awaitingSettlement
    case .matched: hit.order.status == .linked
    case .partial: hit.order.status == .partial
    case .cash: hit.order.status == .settledCash
    case .ignored: hit.order.status == .ignored
    }
}

private func searchHit(_ hit: PurchaseSearchHit, matches kind: PurchaseSearchKind) -> Bool {
    switch (kind, hit) {
    case (.all, _), (.purchases, .purchase), (.lines, .line): true
    default: false
    }
}

private func searchHit(_ hit: PurchaseSearchHit, matches text: String) -> Bool {
    searchableValues(for: hit).contains { $0.localizedCaseInsensitiveContains(text) }
}

private func searchHit(_ hit: PurchaseSearchHit, matches tags: Set<String>) -> Bool {
    guard !tags.isEmpty else { return true }
    guard case .line(_, _, _, _, _, let tagMatch) = hit, let tagMatch else { return false }
    return tags.contains(tagMatch)
}

private func searchableValues(for hit: PurchaseSearchHit) -> [String] {
    switch hit {
    case .purchase(let order, let printedMatch):
        merchantNames(order.merchant) + [printedMatch].compactMap { $0 }
    case .line(_, let name, _, _, let order, let tagMatch):
        [name] + merchantNames(order.merchant) + [tagMatch].compactMap { $0 }
    }
}

private func merchantNames(_ merchant: MerchantIdentity) -> [String] {
    switch merchant {
    case .entity(_, let name, let printed): [name, printed]
    case .printed(let printed): [printed]
    case .unattributed: []
    }
}

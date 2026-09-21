import AppCore
import Foundation

/// One row of a purchases answer: a purchase matched on its merchant, or a
/// line matched on its product or a tag, carrying the order it belongs to.
internal enum PurchaseSearchHit: Identifiable, Equatable {
    /// `printed` is the till's wording when that, and not the name on
    /// screen, is what matched, so the row can show why it is here.
    case purchase(Purchase, printed: String?)
    /// `tag` is the tag that matched when the product name did not.
    case line(PurchaseItemHit, order: Purchase, tag: String?)

    internal var id: String {
        switch self {
        case .purchase(let purchase, _): "purchase-\(purchase.id)"
        case .line(let line, _, _): "line-\(line.id)"
        }
    }

    /// The purchase a tap opens: the order itself, or the order a line is on.
    internal var order: Purchase {
        switch self {
        case .purchase(let purchase, _): purchase
        case .line(_, let order, _): order
        }
    }

    /// What the row sets as its name, and what ranking compares.
    internal var name: String {
        switch self {
        case .purchase(let purchase, _): purchase.merchant.displayName ?? ""
        case .line(let line, _, _): PurchasesSearchEngine.oneLine(line.name)
        }
    }
}

/// Which kind of purchases hit to keep.
internal enum PurchasesKindFilter: String, CaseIterable, Identifiable {
    case any, purchases, lines

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .any: "Any"
        case .purchases: "Purchases"
        case .lines: "Products"
        }
    }
}

/// The settlement states a purchase can be narrowed to, in the words its
/// badge uses.
internal enum PurchasesStatusFilter: String, CaseIterable, Identifiable {
    case any, unmatched, matched, partial, cash, ignored

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .any: "Any"
        case .unmatched: "Unmatched"
        case .matched: "Matched"
        case .partial: "Part matched"
        case .cash: "Cash"
        case .ignored: "Ignored"
        }
    }

    internal func matches(_ status: PurchaseSettlement) -> Bool {
        switch (self, status) {
        case (.any, _), (.unmatched, .awaitingSettlement), (.matched, .linked),
            (.partial, .partial), (.cash, .settledCash), (.ignored, .ignored):
            true
        default: false
        }
    }
}

/// Every narrowing the filter sheet offers Purchases. A line is judged by the
/// status of the order it is on.
internal struct PurchasesSearchFilter: Equatable {
    internal var kind = PurchasesKindFilter.any
    internal var status = PurchasesStatusFilter.any
    /// Lines carrying any of these, and the purchases holding such a line.
    /// Empty means any tag, or none.
    internal var tags: Set<String> = []

    internal var isActive: Bool { self != PurchasesSearchFilter() }

    internal var summary: String {
        [kind == .any ? nil : kind.title, status == .any ? nil : status.title, tagSummary]
            .compactMap(\.self)
            .joined(separator: ", ")
    }

    /// The chosen tags in the order a reader scans them, or nil when none are.
    internal var tagSummary: String? {
        tags.isEmpty ? nil : tags.sorted().joined(separator: ", ")
    }

    internal func carries(_ line: PurchaseItemHit) -> Bool {
        tags.isEmpty || !tags.isDisjoint(with: line.tags)
    }
}

/// The matching rule the purchases pillar's search uses, pure so it can be
/// tested without a view.
///
/// A purchase matches on its merchant: the entity name on screen and the
/// wording the till printed, because a person who types `bunnings` and one
/// who types `alexandria` are looking for the same receipt. A line matches on
/// its product name or any of its tags. Both are case-insensitive substrings,
/// ranked by the same tiers Inventory uses.
internal enum PurchasesSearchEngine {
    internal static func search(
        _ query: String,
        purchases: [Purchase],
        lines: [PurchaseItemHit],
        filter: PurchasesSearchFilter = PurchasesSearchFilter()
    ) -> [PurchaseSearchHit] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        let tagged = lines.filter(filter.carries)
        let taggedOrders = Set(tagged.map(\.purchaseID))
        let orders = purchases.filter {
            filter.status.matches($0.status)
                && (filter.tags.isEmpty || taggedOrders.contains($0.id))
        }
        let purchaseHits =
            filter.kind == .lines ? [] : orders.compactMap { purchaseHit($0, trimmed) }
        let lineHits =
            filter.kind == .purchases ? [] : tagged.compactMap { lineHit($0, trimmed, orders) }
        return rank(trimmed, purchaseHits + lineHits)
    }

    /// A till prints one line over several: a code, a description, then
    /// `Price: open`. In a result row that is three rows' height for one hit,
    /// so the breaks become separators.
    internal static func oneLine(_ name: String) -> String {
        name.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: " · ")
    }

    private static func purchaseHit(_ purchase: Purchase, _ query: String) -> PurchaseSearchHit? {
        switch purchase.merchant {
        case .entity(_, let name, let printed):
            if name.localizedCaseInsensitiveContains(query) {
                return .purchase(purchase, printed: nil)
            }
            return printed.localizedCaseInsensitiveContains(query)
                ? .purchase(purchase, printed: printed) : nil
        case .printed(let printed):
            return printed.localizedCaseInsensitiveContains(query)
                ? .purchase(purchase, printed: nil) : nil
        case .unattributed:
            return nil
        }
    }

    private static func lineHit(
        _ line: PurchaseItemHit, _ query: String, _ orders: [Purchase]
    ) -> PurchaseSearchHit? {
        guard let order = orders.first(where: { $0.id == line.purchaseID }) else { return nil }
        if line.name.localizedCaseInsensitiveContains(query) {
            return .line(line, order: order, tag: nil)
        }
        let tag = line.tags.first { $0.localizedCaseInsensitiveContains(query) }
        return tag.map { .line(line, order: order, tag: $0) }
    }

    private static func rank(_ query: String, _ hits: [PurchaseSearchHit]) -> [PurchaseSearchHit] {
        hits.enumerated()
            .sorted { lhs, rhs in
                let left = InventorySearchRanking.tier(lhs.element.name, query)
                let right = InventorySearchRanking.tier(rhs.element.name, query)
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }
}

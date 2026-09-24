import AppCore
import Foundation

/// Which side of a purchase search hit to keep.
public enum PurchasesSearchKind: String, CaseIterable, Equatable, Sendable {
    case any, purchases, lines

    /// The reader-facing name for the filter fields view.
    public var title: String {
        switch self {
        case .any: "Any"
        case .purchases: "Purchases"
        case .lines: "Products"
        }
    }
}

extension PurchaseSearchStatus {
    /// The reader-facing settlement name for the filter fields view.
    public var title: String {
        switch self {
        case .any: "Any"
        case .unmatched: "Unmatched"
        case .matched: "Matched"
        case .partial: "Part matched"
        case .cash: "Cash"
        case .ignored: "Ignored"
        }
    }
}

/// Every narrowing Purchases' universal search answers to: a kind applied on
/// the phone, a settlement status the server filters by, and item tags the
/// server narrows lines (and the purchases holding such a line) to.
public struct PurchasesSearchFilter: Equatable, Sendable {
    public var kind: PurchasesSearchKind
    public var status: PurchaseSearchStatus
    /// Lines carrying any of these, and the purchases holding such a line.
    /// Empty means any tag, or none.
    public var tags: Set<String>

    /// Creates a filter that keeps every kind, every settlement status, and every tag.
    public init(
        kind: PurchasesSearchKind = .any, status: PurchaseSearchStatus = .any,
        tags: Set<String> = []
    ) {
        self.kind = kind
        self.status = status
        self.tags = tags
    }

    /// Whether any narrowing differs from the default filter.
    public var isActive: Bool { self != PurchasesSearchFilter() }

    /// Every active narrowing, in kind-then-status-then-tags order, empty when none is active.
    public var summary: String {
        [kind == .any ? nil : kind.title, status == .any ? nil : status.title, tagSummary]
            .compactMap(\.self)
            .joined(separator: ", ")
    }

    /// The chosen tags in the order a reader scans them, or nil when none are chosen.
    public var tagSummary: String? {
        tags.isEmpty ? nil : tags.sorted().joined(separator: ", ")
    }

    /// Whether a line carrying `lineTags` matches this filter: any of the chosen tags, or every
    /// line when none are chosen. The purchases pillar applies this same any-of rule on the
    /// server (POPS-4274); this pure form exists so the rule itself stays documented and
    /// testable from the phone even though ``PurchaseSearchHit`` does not carry a line's full
    /// tag set back down the wire.
    public func carries(_ lineTags: Set<String>) -> Bool {
        tags.isEmpty || !tags.isDisjoint(with: lineTags)
    }

    internal func includes(_ hit: PurchaseSearchHit) -> Bool {
        switch kind {
        case .any: true
        case .purchases:
            if case .purchase = hit { true } else { false }
        case .lines:
            if case .line = hit { true } else { false }
        }
    }
}

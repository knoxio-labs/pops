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
/// the phone, and a settlement status the server filters by.
public struct PurchasesSearchFilter: Equatable, Sendable {
    public var kind: PurchasesSearchKind
    public var status: PurchaseSearchStatus

    /// Creates a filter that keeps every kind and every settlement status.
    public init(kind: PurchasesSearchKind = .any, status: PurchaseSearchStatus = .any) {
        self.kind = kind
        self.status = status
    }

    /// Whether any narrowing differs from the default filter.
    public var isActive: Bool { self != PurchasesSearchFilter() }

    /// Every active narrowing, in kind-then-status order, empty when none is active.
    public var summary: String {
        [kind == .any ? nil : kind.title, status == .any ? nil : status.title]
            .compactMap(\.self)
            .joined(separator: ", ")
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

import AppCore
import Foundation

internal enum ArchivePaging: Hashable, Sendable {
    case loading
    case failed
    case end
}

internal struct ArchiveMonth: Identifiable, Hashable {
    internal let month: Date
    internal let purchases: [Purchase]
    internal let isIncomplete: Bool

    internal var id: Date { month }
}

@MainActor
internal enum PurchasesArchive {
    internal static func months(
        _ loaded: [Purchase], scope: PurchasesArchiveScope, paging: ArchivePaging
    ) -> [ArchiveMonth] {
        let inScope = scope == .all ? loaded : loaded.filter(\.status.isUnsettled)
        let boundary = paging == .end ? nil : PurchasesPresentation.byMonth(inScope).last?.month
        return PurchasesPresentation.byMonth(inScope).map { group in
            ArchiveMonth(
                month: group.month,
                purchases: group.purchases,
                isIncomplete: group.month == boundary)
        }
    }

    internal static func showsBadge(
        _ purchase: Purchase, in scope: PurchasesArchiveScope
    ) -> Bool {
        switch scope {
        case .all: purchase.status.isUnsettled
        case .unmatched: purchase.status != .awaitingSettlement
        }
    }
}

extension PurchasesArchiveScope {
    internal var title: String {
        switch self {
        case .all: "All"
        case .unmatched: "Unmatched"
        }
    }

    internal var statusFilter: PurchaseStatusFilter {
        switch self {
        case .all: .all
        case .unmatched: .unsettled
        }
    }
}

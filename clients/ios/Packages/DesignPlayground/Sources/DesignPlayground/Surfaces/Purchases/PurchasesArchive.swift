import AppCore
import Foundation

/// Where loading the history has got to, as the bottom of the list sees it.
///
/// Three cases, not four. "There is more and nothing has asked for it" and
/// "it is loading" are one moment on a phone: the next page is asked for when
/// the last row comes on screen, so the only unfinished bottom a reader ever
/// sees is one that is loading.
internal enum ArchivePaging: Hashable, Sendable {
    case loading
    case failed
    case end
}

/// Which purchases the archive is showing.
internal enum ArchiveScope: Hashable, Sendable, CaseIterable {
    case all
    case unmatched

    internal var title: String {
        switch self {
        case .all: "All"
        case .unmatched: "Unmatched"
        }
    }
}

/// One calendar month of the archive.
internal struct ArchiveMonth: Identifiable, Hashable {
    internal let month: Date
    internal let purchases: [Purchase]
    /// More of this month may sit on a page not loaded yet, so its total is
    /// only what is on screen and says so.
    internal let isIncomplete: Bool

    internal var id: Date { month }
}

@MainActor
internal enum PurchasesArchive {
    /// The loaded rows in scope, cut into months, newest first.
    ///
    /// Everything here is derived from what has loaded, because
    /// `GET /mobile/purchases` takes a limit and a cursor and nothing else: no
    /// status filter, and no count. So the oldest month on screen may carry on
    /// over the next page, and it is marked incomplete rather than totalled as
    /// though it were whole. A month total that is quietly short is worse than
    /// one that admits it is not finished.
    ///
    /// Which month is oldest is decided over every loaded row, not only the
    /// ones in scope. Filtering to unmatched does not move where the page
    /// boundary fell.
    internal static func months(
        _ loaded: [Purchase], scope: ArchiveScope, paging: ArchivePaging
    ) -> [ArchiveMonth] {
        let inScope = scope == .all ? loaded : loaded.filter(\.status.isUnsettled)
        let boundary = paging == .end ? nil : PurchasesPresentation.byMonth(loaded).last?.month
        return PurchasesPresentation.byMonth(inScope).map { group in
            ArchiveMonth(
                month: group.month,
                purchases: group.purchases,
                isIncomplete: group.month == boundary
            )
        }
    }

    /// Whether a row carries its status badge.
    ///
    /// In the whole history, only where the status is a question. Under the
    /// unmatched scope every row is a question, so a badge on each would be
    /// the scope repeated down the column; it stays only where it says
    /// something the scope does not, which is a purchase part matched.
    internal static func showsBadge(_ purchase: Purchase, in scope: ArchiveScope) -> Bool {
        switch scope {
        case .all: purchase.status.isUnsettled
        case .unmatched: purchase.status != .awaitingSettlement
        }
    }
}

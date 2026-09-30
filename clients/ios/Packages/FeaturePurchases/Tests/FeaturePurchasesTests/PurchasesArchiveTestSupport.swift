import AppCore
import AppCoreFakes
import Foundation

@testable import FeaturePurchases

@MainActor
internal enum PurchasesArchiveTestFactory {
    static func model(_ repository: ArchiveRepository) -> PurchasesArchiveViewModel {
        PurchasesArchiveViewModel(dependencies: .fake(purchases: repository))
    }

    static func page(
        _ rows: [Purchase], cursor: String? = nil, total: Int? = nil
    ) -> PurchasePage {
        PurchasePage(purchases: rows, nextCursor: cursor, totalCount: total)
    }

    static func purchase(
        _ id: String, month: Int, status: PurchaseSettlement = .linked
    ) -> Purchase {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        let date =
            calendar.date(from: DateComponents(year: 2026, month: month, day: 10))
            ?? .distantPast
        return .fake(id: id, orderedOn: date, status: status)
    }
}

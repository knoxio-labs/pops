import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase edit draft")
internal struct PurchaseEditDraftTests {
    @Test("a local purchase day does not move backwards through GMT")
    func localDayStaysLocal() throws {
        let timeZone = try #require(TimeZone(identifier: "Australia/Sydney"))
        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.timeZone = timeZone
        components.year = 2026
        components.month = 9
        components.day = 20
        let date = try #require(components.date)

        #expect(PurchaseEditDraft.day(date, timeZone: timeZone) == "2026-09-20")
    }
}

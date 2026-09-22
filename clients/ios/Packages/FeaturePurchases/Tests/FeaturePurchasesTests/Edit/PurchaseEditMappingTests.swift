import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase edit mapping")
internal struct PurchaseEditMappingTests {
    @Test("a saved detail becomes a draft with saved line identities")
    func detailDraft() {
        let detail = Self.detail()

        let draft = PurchaseEditDraft.draft(for: detail)

        #expect(draft.lines.map(\.id) == ["line-1", "line-2"])
        #expect(draft.lines.map(\.description.value) == ["Bread", "Milk"])
        #expect(draft.lines.map(\.amount.value) == ["8.00", "4.00"])
        #expect(draft.lines.map(\.quantity.value) == ["2", ""])
        #expect(draft.merchantResolution == .matched(id: "merchant-1"))
        #expect(PurchaseEditDraft.plain(money(-1_000)) == "10.00")
    }

    @Test("an unchanged draft produces no repository request payload")
    func unchangedDraftSkipsUpdate() throws {
        let detail = Self.detail(updatedAt: nil)
        let opened = PurchaseEditDraft.draft(for: detail)

        #expect(try PurchaseEditMapping.update(from: opened, opened: opened, detail: detail) == nil)
    }

    @Test("renaming one line still sends the complete desired line set")
    func renamedLineSendsFullSet() throws {
        let detail = Self.detail()
        let opened = PurchaseEditDraft.draft(for: detail)
        var draft = opened
        draft.lines[1].description.value = "Oat milk"

        let update = try requireUpdate(from: draft, opened: opened, detail: detail)

        #expect(update.lines.map(\.id) == ["line-1", "line-2"])
        #expect(update.lines.map(\.name) == ["Bread", "Oat milk"])
        #expect(update.merchantEntityID == nil)
        #expect(update.orderedAt == nil)
        #expect(update.totalCents == nil)
        #expect(update.expectedUpdatedAt == "opaque-token")
    }

    @Test("a new line has no server identity while existing lines retain theirs")
    func newLineHasNoID() throws {
        let detail = Self.detail()
        let opened = PurchaseEditDraft.draft(for: detail)
        var draft = opened
        draft.addLine()
        draft.lines[2].description.value = "Tea"
        draft.lines[2].amount.value = "3.50"
        draft.lines[2].quantity.value = "1"
        draft.total.value = "15.50"

        let update = try requireUpdate(from: draft, opened: opened, detail: detail)

        #expect(update.lines.map(\.id) == ["line-1", "line-2", nil])
        #expect(update.lines.last?.name == "Tea")
        #expect(update.subtotalCents == 1_550)
        #expect(update.totalCents == 1_550)
    }

    @Test("removing a linked line omits it from the complete desired set")
    func removedLineIsAbsent() throws {
        let detail = Self.detail()
        let opened = PurchaseEditDraft.draft(for: detail)
        var draft = opened
        draft.removeLine(id: "line-1")
        draft.total.value = "4.00"

        let update = try requireUpdate(from: draft, opened: opened, detail: detail)

        #expect(update.lines.map(\.id) == ["line-2"])
        #expect(update.subtotalCents == 400)
    }

    @Test("a linked purchase drops attempted identity changes but keeps line edits")
    func lockedHeadersAreNotSent() throws {
        let detail = Self.detail(status: .linked)
        let opened = PurchaseEditDraft.draft(for: detail)
        var draft = opened
        draft.merchantResolution = .chosen(id: "merchant-2")
        draft.date.value = "2026-10-01"
        draft.total.value = "99.00"
        draft.lines[0].description.value = "Sourdough"

        let update = try requireUpdate(from: draft, opened: opened, detail: detail)

        #expect(update.merchantEntityID == nil)
        #expect(update.merchantEntityName == nil)
        #expect(update.orderedAt == nil)
        #expect(update.totalCents == nil)
        #expect(update.lines[0].name == "Sourdough")
    }

    @Test("a locked-only change produces no request payload")
    func lockedOnlyChangeSkipsUpdate() throws {
        let detail = Self.detail(status: .linked)
        let opened = PurchaseEditDraft.draft(for: detail)
        var draft = opened
        draft.total.value = "99.00"

        #expect(try PurchaseEditMapping.update(from: draft, opened: opened, detail: detail) == nil)
    }

    @Test("changed unlocked headers are included without unchanged headers")
    func changedUnlockedHeadersAreSent() throws {
        let detail = Self.detail()
        let opened = PurchaseEditDraft.draft(for: detail)
        var draft = opened
        draft.merchantResolution = .chosen(id: "merchant-2")
        draft.date.value = "2026-10-01"

        let update = try requireUpdate(from: draft, opened: opened, detail: detail)

        #expect(update.merchantEntityID == "merchant-2")
        #expect(update.merchantEntityName == nil)
        #expect(update.orderedAt == Self.day(year: 2026, month: 10, day: 1))
        #expect(update.totalCents == nil)
        #expect(update.subtotalCents == nil)
    }

    @Test("removing an adjustment sends an explicit zero")
    func removedAdjustmentSendsZero() throws {
        let detail = Self.detail(tax: money(100))
        let opened = PurchaseEditDraft.draft(for: detail)
        var draft = opened
        draft.removeAdjustment(id: "tax")

        let update = try requireUpdate(from: draft, opened: opened, detail: detail)

        #expect(update.taxCents == 0)
        #expect(update.shippingCents == nil)
        #expect(update.discountCents == nil)
        #expect(update.surchargeCents == nil)
    }

    @Test("an effective edit requires the detail's opaque update token")
    func missingTokenFails() {
        let detail = Self.detail(updatedAt: nil)
        let opened = PurchaseEditDraft.draft(for: detail)
        var draft = opened
        draft.lines[0].description.value = "Changed"

        #expect(throws: PurchaseEditMappingError.missingUpdateToken) {
            try PurchaseEditMapping.update(from: draft, opened: opened, detail: detail)
        }
    }

    @Test("invalid edited values are refused before a request is built")
    func invalidValuesFail() {
        let detail = Self.detail()
        let opened = PurchaseEditDraft.draft(for: detail)

        var badAmount = opened
        badAmount.lines[0].amount.value = "twelve"
        #expect(throws: PurchaseEditMappingError.unparseableAmount) {
            try PurchaseEditMapping.update(from: badAmount, opened: opened, detail: detail)
        }

        var badQuantity = opened
        badQuantity.lines[0].quantity.value = "0"
        #expect(throws: PurchaseEditMappingError.invalidLine) {
            try PurchaseEditMapping.update(from: badQuantity, opened: opened, detail: detail)
        }

        var badDate = opened
        badDate.date.value = "2026-02-30"
        #expect(throws: PurchaseEditMappingError.unparseableDate) {
            try PurchaseEditMapping.update(from: badDate, opened: opened, detail: detail)
        }
    }

    private static func detail(
        status: PurchaseSettlement = .awaitingSettlement,
        tax: MoneyAmount = money(0),
        updatedAt: String? = "opaque-token"
    ) -> PurchaseDetail {
        .fake(
            purchase: .fake(
                id: "purchase-1",
                merchant: .entity(id: "merchant-1", name: "Bakery", printed: "BAKERY"),
                orderedOn: day(), total: money(1_200), status: status),
            subtotal: money(1_200), tax: tax,
            lines: [
                .fake(
                    id: "line-1", name: "Bread", quantity: 2, lineTotal: money(800),
                    hasInventoryLink: true),
                .fake(id: "line-2", name: "Milk", lineTotal: money(400)),
            ],
            updatedAt: updatedAt)
    }

    private static func day(year: Int = 2026, month: Int = 9, day: Int = 20) -> Date {
        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.timeZone = .gmt
        components.year = year
        components.month = month
        components.day = day
        return components.date ?? .distantPast
    }

    private static func money(_ cents: Int) -> MoneyAmount {
        MoneyAmount(minorUnits: cents, currencyCode: "AUD")
    }

    private func requireUpdate(
        from draft: ReceiptDraft,
        opened: ReceiptDraft,
        detail: PurchaseDetail
    ) throws -> PurchaseUpdate {
        let update = try PurchaseEditMapping.update(from: draft, opened: opened, detail: detail)
        return try #require(update)
    }

    private func money(_ cents: Int) -> MoneyAmount { Self.money(cents) }
}

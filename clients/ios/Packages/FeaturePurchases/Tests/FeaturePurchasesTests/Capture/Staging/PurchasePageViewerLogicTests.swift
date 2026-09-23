import AppCore
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase page viewer logic")
@MainActor
internal struct PurchasePageViewerLogicTests {
    private let receipts = [
        StagedReceipt(id: "r1", pages: [page("a")]),
        StagedReceipt(id: "r2", pages: [page("b"), page("c"), page("d")]),
    ]

    @Test("a single-page receipt reads as on its own")
    func loneLocation() {
        #expect(PurchasePageViewerLogic.location(of: "a", in: receipts) == "Receipt 1 · on its own")
    }

    @Test("a page in a multi-page receipt names its photo position")
    func groupedLocation() {
        #expect(
            PurchasePageViewerLogic.location(of: "c", in: receipts) == "Receipt 2 · photo 2 of 3")
    }

    @Test("a page no receipt holds has no location")
    func missingLocation() {
        #expect(PurchasePageViewerLogic.location(of: "gone", in: receipts) == nil)
    }

    @Test(
        "stepping crosses receipts and stops at either end",
        arguments: [
            Step("a", 1, "b"), Step("b", -1, "a"), Step("d", -1, "c"), Step("a", -1, nil),
            Step("d", 1, nil), Step("gone", 1, nil),
        ])
    func stepping(step: Step) {
        let pages = receipts.flatMap(\.pages)
        #expect(
            PurchasePageViewerLogic.step(from: step.from, by: step.delta, in: pages) == step.to)
    }

    @Test("replace marks the page pending first, so the returned page takes its place")
    func replaceKeepsPosition() {
        let model = PurchaseStagingModel(receipts: receipts)
        var handed: [String] = []

        PurchasePageViewerLogic.replace(page("c"), in: model) { handed.append($0.id) }
        let replaced = model.replaceIfPending(with: Self.page("new"))

        #expect(handed == ["c"])
        #expect(replaced)
        #expect(model.everyPage.map(\.id) == ["a", "b", "new", "d"])
    }

    private func page(_ id: String) -> StagedPage { Self.page(id) }

    private static func page(_ id: String) -> StagedPage {
        StagedPage(
            id: id, label: "\(id).HEIC", part: ReceiptPart(mediaType: .jpeg, data: Data([0])))
    }
}

internal struct Step: Sendable, CustomTestStringConvertible {
    let from: String
    let delta: Int
    let to: String?

    init(_ from: String, _ delta: Int, _ to: String?) {
        self.from = from
        self.delta = delta
        self.to = to
    }

    var testDescription: String { "\(from) \(delta > 0 ? "+" : "")\(delta) → \(to ?? "nil")" }
}

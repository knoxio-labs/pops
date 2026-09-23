import AppCore
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase staging model")
@MainActor
internal struct PurchaseStagingModelTests {
    @Test("empty initialization exposes an empty shape")
    func empty() {
        let model = PurchaseStagingModel()

        #expect(model.isEmpty)
        #expect(model.groups.isEmpty)
        #expect(model.loose.isEmpty)
        #expect(model.everyPage.isEmpty)
    }

    @Test("seeded initialization preserves receipt and page order")
    func seeded() {
        let model = model([receipt("group", ["a", "b"]), receipt("loose", ["c"])])

        #expect(model.groups.map(\.id) == ["group"])
        #expect(model.loose.map(\.id) == ["c"])
        #expect(model.everyPage.map(\.id) == ["a", "b", "c"])
        #expect(model.count == 2)
        #expect(!model.isEmpty)
    }

    @Test("combine forms one receipt in target-first order")
    func combine() {
        let model = model([receipt("first", ["a"]), receipt("second", ["b"])])

        model.combine(["a"], with: "b")

        #expect(shape(model) == [["b", "a"]])
    }

    @Test("move appends pages to the destination receipt")
    func move() {
        let model = model([receipt("first", ["a", "b"]), receipt("second", ["c"])])

        model.move(["c"], into: "first")

        #expect(shape(model) == [["a", "b", "c"]])
    }

    @Test("separate moves a page into its own loose receipt")
    func separate() {
        let model = model([receipt("group", ["a", "b", "c"])])

        model.separate(["b"])

        #expect(shape(model) == [["a", "c"], ["b"]])
        #expect(model.loose.map(\.id) == ["b"])
    }

    @Test("delete removes a page and an emptied receipt")
    func delete() {
        let model = model([receipt("first", ["a", "b"]), receipt("second", ["c"])])

        model.delete("b")
        model.delete("c")

        #expect(shape(model) == [["a"]])
        #expect(model.count == 1)
    }

    @Test("a receipt remains valid beyond the retired eight-page ceiling")
    func unboundedReceipt() {
        let ids = (1...9).map { "page-\($0)" }
        let model = model([receipt("long", ids)])

        #expect(model.groups.first?.pages.map(\.id) == ids)
        #expect(model.everyPage.count == 9)
    }

    private func model(_ receipts: [StagedReceipt]) -> PurchaseStagingModel {
        PurchaseStagingModel(receipts: receipts)
    }

    private func receipt(_ id: String, _ pageIDs: [String]) -> StagedReceipt {
        StagedReceipt(id: id, pages: pageIDs.map(page))
    }

    private func page(_ id: String) -> StagedPage {
        StagedPage(
            id: id,
            label: "\(id).HEIC",
            part: ReceiptPart(mediaType: .jpeg, data: Data()))
    }

    private func shape(_ model: PurchaseStagingModel) -> [[String]] {
        model.groups.map { $0.pages.map(\.id) }
            + model.loose.map { [$0.id] }
    }
}

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

    @Test("a prepared scan arrives as one ordered receipt")
    func scannedReceipt() {
        let model = PurchaseStagingModel()
        let parts = (1...3).map(part)

        model.addScanned(parts, pageCount: 3)

        #expect(model.count == 1)
        #expect(model.everyPage.map(\.label) == ["Scan page 1", "Scan page 2", "Scan page 3"])
        #expect(model.readingInput.first?.parts == parts)
        #expect(model.refusal == nil)
    }

    @Test(
        "a scan whose prepared parts do not match its page count is refused without changing staging",
        arguments: [2, 4])
    func unpreparedScan(partCount: Int) {
        let model = model([receipt("existing", ["a"])])

        model.addScanned((1...partCount).map(part), pageCount: 3)

        #expect(model.refusal == .unpreparedPages)
        #expect(model.everyPage.map(\.id) == ["a"])
        model.acknowledgeRefusal()
        #expect(model.refusal == nil)
    }

    @Test("an empty scan is refused without staging a receipt")
    func emptyScan() {
        let model = PurchaseStagingModel()

        model.addScanned([], pageCount: 0)

        #expect(model.refusal == .noPages)
        #expect(model.isEmpty)
    }

    @Test("a scan longer than eight pages stays grouped")
    func longScan() {
        let model = PurchaseStagingModel()
        let parts = (1...9).map(part)

        model.addScanned(parts, pageCount: parts.count)

        #expect(model.count == 1)
        #expect(model.groups.first?.pages.count == 9)
        #expect(model.readingInput.first?.parts == parts)
        #expect(model.refusal == nil)
    }

    @Test("reading input preserves receipt order and page order")
    func readingInput() {
        let firstPages = [page("a", value: 1), page("b", value: 2)]
        let secondPages = [page("c", value: 3)]
        let model = model([
            StagedReceipt(id: "first", pages: firstPages),
            StagedReceipt(id: "second", pages: secondPages),
        ])

        let input = model.readingInput

        #expect(input.map(\.id) == ["first", "second"])
        #expect(input.map { $0.parts.map(\.data) } == [[Data([1]), Data([2])], [Data([3])]])
    }

    @Test("replacement keeps the receipt identity, index and page count")
    func replacement() {
        let model = model([
            receipt("first", ["a", "b"]),
            receipt("second", ["c"]),
        ])
        let replacement = page("replacement", value: 9)

        model.beginReplacing("b")
        let replaced = model.replaceIfPending(with: replacement)

        #expect(replaced)
        #expect(model.readingInput.map(\.id) == ["first", "second"])
        #expect(model.everyPage.map(\.id) == ["a", "replacement", "c"])
        #expect(model.everyPage.count == 3)
    }

    @Test("replacement without a pending page changes nothing")
    func replacementWithoutPendingPage() {
        let model = model([receipt("first", ["a", "b"])])

        let replaced = model.replaceIfPending(with: page("replacement"))

        #expect(!replaced)
        #expect(model.everyPage.map(\.id) == ["a", "b"])
    }

    @Test("a supported file resolves into staging and clears its pending tile")
    func supportedFile() async {
        let model = PurchaseStagingModel()
        let data = Data("Coffee 4.50".utf8)

        await model.addFromFileURLs([
            (URL(fileURLWithPath: "/picked/receipt.txt"), data)
        ])

        #expect(model.pending.isEmpty)
        #expect(model.loose.count == 1)
        #expect(model.loose[0].label == "receipt.txt")
        #expect(model.loose[0].part == ReceiptPart(mediaType: .plainText, data: data))
    }

    @Test("an unsupported file remains failed without changing staging")
    func unsupportedFile() async {
        let model = PurchaseStagingModel()

        await model.addFromFileURLs([
            (URL(fileURLWithPath: "/picked/receipt.docx"), Data([1, 2, 3]))
        ])

        #expect(model.isEmpty)
        #expect(model.pending.count == 1)
        #expect(model.pending[0].label == "receipt.docx")
        #expect(model.pending[0].phase == .failed(reason: .unsupportedType))
    }

    @Test("removing a pending item leaves its siblings")
    func removePending() {
        let model = PurchaseStagingModel(
            receipts: [],
            pending: [
                PendingStagedItem(id: "first", label: "first", phase: .loading),
                PendingStagedItem(
                    id: "second", label: "second", phase: .failed(reason: .unreadable)),
            ])

        model.removePending("first")

        #expect(model.pending.map(\.id) == ["second"])
    }

    @Test("Read waits for staged content and loading conversions")
    func canRead() {
        let empty = PurchaseStagingModel()
        let loading = PurchaseStagingModel(
            receipts: [receipt("ready", ["page"])],
            pending: [PendingStagedItem(id: "loading", label: "loading", phase: .loading)])
        let failed = PurchaseStagingModel(
            receipts: [receipt("ready", ["page"])],
            pending: [
                PendingStagedItem(
                    id: "failed", label: "failed", phase: .failed(reason: .unreadable))
            ])

        #expect(!empty.canRead)
        #expect(!loading.canRead)
        #expect(failed.canRead)
    }

    private func model(_ receipts: [StagedReceipt]) -> PurchaseStagingModel {
        PurchaseStagingModel(receipts: receipts)
    }

    private func receipt(_ id: String, _ pageIDs: [String]) -> StagedReceipt {
        StagedReceipt(id: id, pages: pageIDs.map { page($0) })
    }

    private func page(_ id: String, value: UInt8 = 0) -> StagedPage {
        StagedPage(
            id: id,
            label: "\(id).HEIC",
            part: ReceiptPart(mediaType: .jpeg, data: Data([value])))
    }

    private func part(_ value: Int) -> ReceiptPart {
        ReceiptPart(mediaType: .jpeg, data: Data([UInt8(value)]))
    }

    private func shape(_ model: PurchaseStagingModel) -> [[String]] {
        model.groups.map { $0.pages.map(\.id) }
            + model.loose.map { [$0.id] }
    }
}

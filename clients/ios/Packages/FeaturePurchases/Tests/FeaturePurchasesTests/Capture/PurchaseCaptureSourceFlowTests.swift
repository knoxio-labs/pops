import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Purchase capture source flow")
internal struct PurchaseCaptureSourceFlowTests {
    @Test("camera refusals open no picker and preserve their Settings policy")
    func cameraRefusals() async throws {
        let denied = makeFlow(camera: SourceFlowCamera(.denied))
        await denied.start(.scan)

        #expect(denied.picker == nil)
        #expect(try #require(denied.cameraRefusal).offersSettings)

        let restricted = makeFlow(camera: SourceFlowCamera(.restricted))
        await restricted.start(.scan)
        #expect(restricted.picker == nil)
        #expect(!(try #require(restricted.cameraRefusal).offersSettings))

        let unavailable = makeFlow(camera: SourceFlowCamera(.unavailable))
        await unavailable.start(.scan)
        #expect(unavailable.picker == nil)
        #expect(!(try #require(unavailable.cameraRefusal).offersSettings))
    }

    @Test("camera authorization opens the scanner")
    func authorizedScanner() async {
        let flow = makeFlow(camera: SourceFlowCamera(.authorized))

        await flow.start(.scan)

        #expect(flow.picker == .scanner)
        #expect(flow.cameraRefusal == nil)
        #expect(flow.sheet == nil)
    }

    @Test("acknowledging a home camera refusal resets the run")
    func acknowledgeCameraRefusal() async {
        let flow = makeFlow(camera: SourceFlowCamera(.denied))
        await flow.start(.scan)

        flow.acknowledgeCameraRefusal()

        #expect(flow.cameraRefusal == nil)
        expectReset(flow)
    }

    @Test("a two-page home scan opens one grouped receipt after dismissal")
    func homeScanOpensBatch() async throws {
        let flow = makeFlow()
        await flow.start(.scan)

        flow.didScan(parts: [.fake(data: Data([1])), .fake(data: Data([2]))], pageCount: 2)
        flow.pickerDismissed()

        #expect(flow.sheet == .batch)
        #expect(try #require(flow.staging).groups.count == 1)
        #expect(flow.staging?.groups[0].pages.count == 2)
    }

    @Test("picked files pass through staging intake before the batch opens")
    func homeFileOpensBatch() async throws {
        let flow = makeFlow()
        await flow.start(.file)

        await flow.didPickFiles([
            (URL(fileURLWithPath: "/picked/receipt.txt"), Data("receipt".utf8))
        ])
        flow.pickerDismissed()

        #expect(flow.sheet == .batch)
        #expect(try #require(flow.staging).everyPage.map(\.part.data) == [Data("receipt".utf8)])
        #expect(flow.staging?.pending.isEmpty == true)
    }

    @Test("cancelling a home scan ends without completion")
    func cancelHomeScan() async {
        var callbacks: [[Purchase.ID]] = []
        let flow = makeFlow(onSaved: { callbacks.append($0) })
        await flow.start(.scan)

        flow.pickerDismissed()

        #expect(callbacks.isEmpty)
        expectReset(flow)
    }

    @Test("cancelling an Add scan leaves the batch unchanged")
    func cancelAddScan() async throws {
        let flow = makeFlow()
        await openEmptyBatch(flow)
        let staging = try #require(flow.staging)
        staging.addScanned([.fake(data: Data([1]))], pageCount: 1)

        await flow.pick(.scan)
        flow.pickerDismissed()

        #expect(flow.sheet == .batch)
        #expect(flow.staging === staging)
        #expect(staging.everyPage.count == 1)
    }

    @Test("a replacement scan swaps only the selected page")
    func replaceWithScan() async throws {
        let flow = makeFlow()
        await openEmptyBatch(flow)
        let staging = try #require(flow.staging)
        staging.addScanned(
            [.fake(data: Data([1])), .fake(data: Data([2]))],
            pageCount: 2)
        let replacing = try #require(staging.everyPage.first?.id)

        await flow.pick(.scan, replacing: replacing)
        flow.didScan(parts: [.fake(data: Data([9]))], pageCount: 1)
        flow.pickerDismissed()

        #expect(staging.everyPage.map(\.part.data) == [Data([9]), Data([2])])
        #expect(staging.everyPage.count == 2)
    }

    @Test("a multi-page scan in place of one page keeps the page and stages every scanned page")
    func replaceWithMultiPageScan() async throws {
        let flow = makeFlow()
        await openEmptyBatch(flow)
        let staging = try #require(flow.staging)
        staging.addScanned([.fake(data: Data([1]))], pageCount: 1)
        let replacing = try #require(staging.everyPage.first?.id)

        await flow.pick(.scan, replacing: replacing)
        flow.didScan(parts: [.fake(data: Data([8])), .fake(data: Data([9]))], pageCount: 2)
        flow.pickerDismissed()

        let receipts = staging.receipts.map { $0.pages.map(\.part.data) }
        #expect(receipts == [[Data([1])], [Data([8]), Data([9])]])
    }

    @Test("a replacement scan whose page has gone is staged instead of dropped")
    func replaceVanishedPage() async throws {
        let flow = makeFlow()
        await openEmptyBatch(flow)
        let staging = try #require(flow.staging)
        staging.addScanned([.fake(data: Data([1]))], pageCount: 1)
        let replacing = try #require(staging.everyPage.first?.id)

        await flow.pick(.scan, replacing: replacing)
        staging.delete(replacing)
        flow.didScan(parts: [.fake(data: Data([9]))], pageCount: 1)
        flow.pickerDismissed()

        #expect(staging.everyPage.map(\.part.data) == [Data([9])])
    }

    private func makeFlow(
        camera: SourceFlowCamera = SourceFlowCamera(.authorized),
        onSaved: @escaping ([Purchase.ID]) -> Void = { _ in }
    ) -> PurchaseCaptureFlow {
        PurchaseCaptureFlow(
            dependencies: .fake(receiptCapture: InMemoryReceiptCaptureRepository()),
            camera: camera,
            onSaved: onSaved,
            reportInvalidTransition: { _ in })
    }

    private func openEmptyBatch(_ flow: PurchaseCaptureFlow) async {
        await flow.start(.photos)
        flow.sheet = .batch
        flow.pickerDismissed()
    }

    private func expectReset(_ flow: PurchaseCaptureFlow) {
        #expect(flow.sheet == nil)
        #expect(flow.path.isEmpty)
        #expect(flow.staging == nil)
        #expect(flow.reading == nil)
        #expect(flow.review == nil)
        #expect(flow.handEntry == nil)
    }
}

private struct SourceFlowCamera: CameraAuthorizing {
    let access: CameraAccess

    init(_ access: CameraAccess) {
        self.access = access
    }

    func currentAccess() -> CameraAccess { access }
    func requestAccess() async -> CameraAccess { access }
}

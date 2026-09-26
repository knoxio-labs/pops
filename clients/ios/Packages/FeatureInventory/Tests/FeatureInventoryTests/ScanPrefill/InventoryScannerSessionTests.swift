import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory scanner session", .timeLimit(.minutes(1)))
internal struct InventoryScannerSessionTests {
    @Test("an empty recognition batch leaves the session ready")
    func emptyBatchDoesNothing() async {
        let opened = await ScanPrefillFixture.open()
        defer { opened.loading.cancel() }
        let callback = ScanPrefillCallbackRecorder()
        let session = InventoryScannerSession(model: opened.form)

        session.recognizeBarcodes([], onFound: callback.call)

        #expect(session.processing == nil)
        #expect(!session.showsTextPrompt)
        #expect(callback.invocations == 0)
        #expect(await opened.lookup.codes.isEmpty)
    }

    @Test("the first recognized barcode is accepted once while lookup is suspended")
    func firstBarcodeWins() async {
        let gate = ScanPrefillGate()
        let lookup = ScanPrefillLookupGate(result: .notFound, gate: gate)
        let opened = await ScanPrefillFixture.open(lookUp: { try await lookup.lookUp($0) })
        defer { opened.loading.cancel() }
        let session = InventoryScannerSession(model: opened.form)

        session.recognizeBarcodes(["first", "second"], onFound: {})
        await gate.awaitEntry()
        session.recognizeBarcodes(["third"], onFound: {})
        #expect(await lookup.payloads == ["first"])

        let processing = session.processing
        await gate.open()
        await processing?.value
    }

    @Test("a miss shows the text prompt and ignores subsequent barcodes")
    func missShowsPromptOnce() async {
        let opened = await ScanPrefillFixture.open(lookupResult: .notFound)
        defer { opened.loading.cancel() }
        let session = InventoryScannerSession(model: opened.form)

        session.recognizeBarcodes(["missing"], onFound: {})
        await session.processing?.value
        #expect(session.showsTextPrompt)

        session.recognizeBarcodes(["later"], onFound: {})
        #expect(await opened.lookup.codes == ["missing"])
        #expect(session.showsTextPrompt)
    }

    @Test("a found callback fires while field generation is still suspended")
    func foundDismissesBeforeFill() async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        let callback = ScanPrefillCallbackRecorder()
        let session = InventoryScannerSession(model: opened.form)

        session.recognizeBarcodes(["found"], onFound: callback.call)
        await session.processing?.value
        await gate.awaitEntry()

        #expect(callback.invocations == 1)
        #expect(opened.form.prefillStatus == .running)
        let filling = opened.form.fillTask
        await gate.open()
        await filling?.value
    }

    @Test("stopping during lookup suppresses completion and generation")
    func stopSuppressesLateLookup() async {
        let gate = ScanPrefillGate()
        let lookup = ScanPrefillLookupGate(
            result: .found(ScanPrefillFixture.product), gate: gate)
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(
            lookUp: { try await lookup.lookUp($0) }, generator: generator)
        defer { opened.loading.cancel() }
        let callback = ScanPrefillCallbackRecorder()
        let session = InventoryScannerSession(model: opened.form)
        session.recognizeBarcodes(["held"], onFound: callback.call)
        await gate.awaitEntry()
        let processing = session.processing

        session.stop()
        await gate.open()
        await processing?.value

        #expect(session.processing == nil)
        #expect(callback.invocations == 0)
        #expect(!session.showsTextPrompt)
        #expect(await generator.requests.isEmpty)
    }
}

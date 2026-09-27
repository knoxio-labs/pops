import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory scan failure reporting", .timeLimit(.minutes(1)))
internal struct InventoryScanFailureTests {
    @Test("a failed text generation remains reportable after applying empty suggestions")
    func textFailureRemainsVisible() async throws {
        let generator = RecordingInventoryPrefillGenerator(tokenBudget: 10_000, failures: [0])
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }

        opened.form.handleCapturedText(["Tape 50 m"])
        await opened.form.fillTask?.value

        let failure = try #require(opened.form.scanFailure)
        #expect(failure.code == "ios.inventory.prefill_generation_failed")
        #expect(opened.form.prefillStatus == .lookupFailed(failure))
        #expect(!failure.message.contains("Tape"))
    }

    @Test("successful text capture after generation failure clears its stale status")
    func successfulRetryClearsGenerationFailure() async {
        let generator = RecordingInventoryPrefillGenerator(
            tokenBudget: 10_000, answers: [[:], [ScanPrefillFixture.detail.id: .text("Tape")]],
            failures: [0])
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        opened.form.handleCapturedText(["Tape"])
        await opened.form.fillTask?.value
        opened.form.scanFailure = nil

        opened.form.handleCapturedText(["Tape"])
        await opened.form.fillTask?.value

        #expect(opened.form.prefillFailure == nil)
        #expect(opened.form.prefillStatus == nil)
        #expect(opened.form.scanFailure == nil)
        #expect(
            opened.form.protocol2Draft?.values(for: ScanPrefillFixture.detail) == [.string("Tape")])
    }

    @Test(
        "unsupported barcode preserves the identifier and offers text without reporting an outage")
    func unsupportedBarcodeIsNotOutage() async {
        let opened = await ScanPrefillFixture.open(lookupResult: .unsupported)
        defer { opened.loading.cancel() }

        #expect(await opened.form.handleScannedBarcode("5012345678900") == .miss)
        #expect(opened.form.prefillStatus == .barcodeUnsupported)
        #expect(opened.form.scanFailure == nil)
        #expect(opened.form.draft.identifiers.first?.kind == "barcode")
    }
}

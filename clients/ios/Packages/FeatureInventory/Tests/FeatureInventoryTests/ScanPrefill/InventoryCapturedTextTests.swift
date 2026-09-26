import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory captured text prefill", .timeLimit(.minutes(1)))
internal struct InventoryCapturedTextTests {
    @Test("empty lines report no text without invoking the engine")
    func emptyLinesSkipEngine() async {
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }

        opened.form.handleCapturedText([])
        await opened.form.fillTask?.value

        #expect(opened.form.prefillStatus == .noText)
        #expect(opened.form.fillTask == nil)
        #expect(await generator.requests.isEmpty)
    }

    @Test(
        "captured lines and the current type are sent to the engine without staging a photo",
        arguments: [false, true])
    func sendsTextForCapturedType(alternate: Bool) async throws {
        let type = alternate ? ScanPrefillFixture.alternateType : ScanPrefillFixture.productType
        let field = try #require(type.fields.first)
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [field.id: .text("filled")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        opened.form.selectProtocol2Type(type.id)
        let draft = opened.form.draft

        opened.form.handleCapturedText(["Model A", "Serial 123"])
        #expect(opened.form.prefillStatus == .running)
        await gate.awaitEntry()

        let request = try #require(await generator.requests.first)
        #expect(request.source == .text(["Model A", "Serial 123"]))
        #expect(request.fieldIDs == [field.id])
        #expect(opened.form.protocol2Draft?.values(for: field).isEmpty == true)
        await gate.open()
        await opened.form.fillTask?.value

        #expect(opened.form.protocol2Draft?.values(for: field) == [.string("filled")])
        #expect(opened.form.prefillStatus == nil)
        #expect(opened.form.draft == draft)
        #expect(await generator.requests.count == 1)
        #expect(await opened.lookup.codes.isEmpty)
    }

    @Test(
        "leaving the captured type prevents a late text fill",
        arguments: [ScanTypeDeparture.change, .clear])
    func typeDeparturePreventsFill(departure: ScanTypeDeparture) async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [ScanPrefillFixture.detail.id: .text("stale")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }

        opened.form.handleCapturedText(["label"])
        await gate.awaitEntry()
        let filling = opened.form.fillTask
        opened.form.selectProtocol2Type(
            departure == .change ? ScanPrefillFixture.alternateType.id : nil)
        let draft = opened.form.protocol2Draft
        await gate.open()
        await filling?.value

        #expect(filling?.isCancelled == true)
        #expect(opened.form.protocol2Draft == draft)
        #expect(opened.form.prefillStatus == nil)
    }

    @Test("an empty engine result leaves the draft unchanged")
    func emptyResultDoesNotMutateDraft() async {
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        opened.form.draft.name = "My item"
        opened.form.draft.note = "Keep this note"
        let draft = opened.form.draft
        let before = opened.form.protocol2Draft

        opened.form.handleCapturedText(["unmatched label"])
        await opened.form.fillTask?.value

        #expect(opened.form.protocol2Draft == before)
        #expect(opened.form.draft == draft)
        #expect(await generator.requests.count == 1)
        #expect(opened.form.prefillStatus == .nothingFound)
    }

    @Test("text without a selected type does not start generation")
    func missingTypeSkipsEngine() async {
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(generator: generator, selectType: false)
        defer { opened.loading.cancel() }

        opened.form.handleCapturedText(["Label"])
        await opened.form.fillTask?.value

        #expect(opened.form.prefillStatus == .nothingFound)
        #expect(await generator.requests.isEmpty)
    }

    @Test("returning to the captured type still rejects a cancelled text fill")
    func returningToTypeDoesNotReviveFill() async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [ScanPrefillFixture.detail.id: .text("stale")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        opened.form.handleCapturedText(["Label"])
        await gate.awaitEntry()
        let filling = opened.form.fillTask

        opened.form.selectProtocol2Type(ScanPrefillFixture.alternateType.id)
        opened.form.selectProtocol2Type(ScanPrefillFixture.productType.id)
        await gate.open()
        await filling?.value

        #expect(opened.form.protocol2Draft?.values(for: ScanPrefillFixture.detail).isEmpty == true)
        #expect(opened.form.prefillStatus == nil)
    }

    @Test("a new empty capture cancels a pending fill and retains the no-text status")
    func emptyCaptureCancelsPreviousFill() async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [ScanPrefillFixture.detail.id: .text("stale")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        opened.form.handleCapturedText(["Label"])
        await gate.awaitEntry()
        let filling = opened.form.fillTask

        opened.form.handleCapturedText([])
        await gate.open()
        await filling?.value

        #expect(filling?.isCancelled == true)
        #expect(opened.form.prefillStatus == .noText)
        #expect(opened.form.protocol2Draft?.values(for: ScanPrefillFixture.detail).isEmpty == true)
        #expect(await generator.requests.count == 1)
    }
}

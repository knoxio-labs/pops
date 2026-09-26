import AppCore
import Testing

@testable import FeatureInventory

internal enum ScanTypeDeparture: Sendable, CustomTestStringConvertible {
    case change
    case clear

    var testDescription: String { self == .change ? "change" : "clear" }
}

@MainActor
@Suite("Inventory scan lookup and prefill outcomes", .timeLimit(.minutes(1)))
internal struct InventoryScanOutcomeTests {
    @Test("a found product returns before generation completes and names only a blank draft")
    func foundReturnsBeforeFill() async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }

        #expect(await opened.form.handleScannedBarcode("5012345678900") == .found)
        await gate.awaitEntry()
        #expect(opened.form.draft.name == ScanPrefillFixture.product.title)
        #expect(opened.form.prefillStatus == .running)

        let filling = opened.form.fillTask
        await gate.open()
        await filling?.value
    }

    @Test("a found product preserves a name the person already entered")
    func foundPreservesName() async {
        let opened = await ScanPrefillFixture.open()
        defer { opened.loading.cancel() }
        opened.form.draft.name = "My copy"

        #expect(await opened.form.handleScannedBarcode("5012345678900") == .found)
        await opened.form.fillTask?.value

        #expect(opened.form.draft.name == "My copy")
    }

    @Test("generation applies to the type captured at lookup completion")
    func appliesToCapturedType() async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [ScanPrefillFixture.detail.id: .text("filled")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }

        _ = await opened.form.handleScannedBarcode("5012345678900")
        await gate.awaitEntry()
        let filling = opened.form.fillTask
        await gate.open()
        await filling?.value

        #expect(
            opened.form.protocol2Draft?.values(for: ScanPrefillFixture.detail)
                == [.string("filled")])
    }

    @Test(
        "leaving the captured type prevents a late fill",
        arguments: [ScanTypeDeparture.change, .clear])
    func departurePreventsFill(departure: ScanTypeDeparture) async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [ScanPrefillFixture.detail.id: .text("stale")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        _ = await opened.form.handleScannedBarcode("5012345678900")
        await gate.awaitEntry()
        let filling = opened.form.fillTask

        opened.form.selectProtocol2Type(
            departure == .change ? ScanPrefillFixture.alternateType.id : nil)
        await gate.open()
        await filling?.value

        #expect(opened.form.protocol2Draft?.values(for: ScanPrefillFixture.detail).isEmpty != false)
        #expect(
            opened.form.protocol2Draft?.values(for: ScanPrefillFixture.alternateDetail).isEmpty
                != false)
    }

    @Test("leaving and returning to the captured type still cancels its stale fill")
    func leavingAndReturningPreventsFill() async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [ScanPrefillFixture.detail.id: .text("stale")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        _ = await opened.form.handleScannedBarcode("5012345678900")
        await gate.awaitEntry()
        let filling = opened.form.fillTask

        opened.form.selectProtocol2Type(ScanPrefillFixture.alternateType.id)
        opened.form.selectProtocol2Type(ScanPrefillFixture.productType.id)
        await gate.open()
        await filling?.value

        #expect(opened.form.protocol2Draft?.values(for: ScanPrefillFixture.detail).isEmpty == true)
    }

    @Test("a field touched while generation runs is protected at apply time")
    func touchedFieldIsProtected() async throws {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [ScanPrefillFixture.detail.id: .text("generated")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        _ = await opened.form.handleScannedBarcode("5012345678900")
        await gate.awaitEntry()
        let entry = try #require(
            opened.form.protocol2Draft?.draftEntries(for: ScanPrefillFixture.detail).first)
        opened.form.protocol2Draft?.setText(
            "typed", entryId: entry.id, for: ScanPrefillFixture.detail)

        let filling = opened.form.fillTask
        await gate.open()
        await filling?.value

        #expect(
            opened.form.protocol2Draft?.values(for: ScanPrefillFixture.detail)
                == [.string("typed")])
    }

    @Test(
        "definite and temporary lookup misses never invoke generation",
        arguments: [InventoryBarcodeLookup.notFound, .unavailable])
    func lookupMissSkipsEngine(result: InventoryBarcodeLookup) async {
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(
            lookupResult: result, generator: generator)
        defer { opened.loading.cancel() }

        #expect(await opened.form.handleScannedBarcode("5012345678900") == .miss)
        #expect(await generator.requests.isEmpty)
    }

    @Test("a thrown lookup failure never invokes generation")
    func thrownLookupSkipsEngine() async {
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(
            lookUp: { _ in throw ScanPrefillLookupFailure() }, generator: generator)
        defer { opened.loading.cancel() }

        #expect(await opened.form.handleScannedBarcode("5012345678900") == .miss)
        #expect(opened.form.prefillStatus == .lookupUnavailable)
        #expect(await generator.requests.isEmpty)
    }

    @Test("offline scan records no lookup and starts no generation")
    func offlineSkipsRemoteWork() async {
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(
            status: .offline(lastRefreshAt: nil), generator: generator)
        defer { opened.loading.cancel() }

        #expect(await opened.form.handleScannedBarcode("5012345678900") == .miss)
        #expect(await opened.lookup.codes.isEmpty)
        #expect(await generator.requests.isEmpty)
    }

    @Test("clearing the type while lookup is suspended turns completion into a miss")
    func clearDuringLookupMisses() async {
        let gate = ScanPrefillGate()
        let lookup = ScanPrefillLookupGate(result: .found(ScanPrefillFixture.product), gate: gate)
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(
            lookUp: { try await lookup.lookUp($0) }, generator: generator)
        defer { opened.loading.cancel() }
        let handling = Task { await opened.form.handleScannedBarcode("5012345678900") }
        await gate.awaitEntry()

        opened.form.selectProtocol2Type(nil)
        await gate.open()

        #expect(await handling.value == .miss)
        #expect(opened.form.draft.name.isEmpty)
        #expect(await generator.requests.isEmpty)
    }

    @Test("cancelling an in-flight fill prevents its late answer from applying")
    func cancelPreventsApply() async {
        let gate = ScanPrefillGate()
        let generator = ScanPrefillGenerator(
            answer: [ScanPrefillFixture.detail.id: .text("late")], gate: gate)
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }
        _ = await opened.form.handleScannedBarcode("5012345678900")
        await gate.awaitEntry()
        let filling = opened.form.fillTask

        opened.form.cancelScanPrefill()
        await gate.open()
        await filling?.value

        #expect(opened.form.protocol2Draft?.values(for: ScanPrefillFixture.detail).isEmpty == true)
    }
}

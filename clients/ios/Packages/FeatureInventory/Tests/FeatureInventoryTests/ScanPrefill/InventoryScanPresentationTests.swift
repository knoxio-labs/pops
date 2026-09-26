import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory form scan presentation")
internal struct InventoryScanPresentationTests {
    @Test(
        "edit and labelling forms never show the scan button",
        arguments: [InventoryItemFormRequest.edit("item"), .labelling("item")])
    func existingItemHidesScan(request: InventoryItemFormRequest) async {
        let opened = await ScanPrefillFixture.open(request: request)
        defer { opened.loading.cancel() }

        #expect(!opened.form.showsScanButton)
    }

    @Test("a create needs a selected type and available on-device generation")
    func createRequirements() async {
        let noType = await ScanPrefillFixture.open(selectType: false)
        let unavailable = await ScanPrefillFixture.open(available: false)
        let available = await ScanPrefillFixture.open()
        defer {
            noType.loading.cancel()
            unavailable.loading.cancel()
            available.loading.cancel()
        }

        #expect(!noType.form.showsScanButton)
        #expect(!unavailable.form.showsScanButton)
        #expect(available.form.showsScanButton)
    }

    @Test("choosing and clearing a type updates scan visibility")
    func typeSelectionUpdatesVisibility() async {
        let opened = await ScanPrefillFixture.open(selectType: false)
        defer { opened.loading.cancel() }
        #expect(!opened.form.showsScanButton)

        opened.form.selectProtocol2Type(ScanPrefillFixture.productType.id)
        #expect(opened.form.showsScanButton)
        opened.form.selectProtocol2Type(nil)
        #expect(!opened.form.showsScanButton)
    }

    @Test("scan visibility follows observed model availability")
    func availabilityUpdatesVisibility() async {
        let state = ScanPrefillAvailabilityState(isAvailable: false)
        let availability = InventoryPrefillAvailability { state.isAvailable }
        let scan = InventoryScanPrefill(
            lookUp: { _ in .unavailable },
            engine: InventoryPrefillEngine(generator: ScanPrefillGenerator()),
            availability: availability)
        let form = InventoryItemFormModel(
            request: .create(placement: nil),
            store: RecordingFormStore(
                FormFixtureSource(protocol2Catalogue: ScanPrefillFixture.catalogue)),
            suggester: .unbound, scan: scan)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.selectProtocol2Type(ScanPrefillFixture.productType.id)
        #expect(!form.showsScanButton)

        state.isAvailable = true
        await awaitObservedCondition { form.showsScanButton }
        #expect(form.showsScanButton)
        state.isAvailable = false
        await awaitObservedCondition { !form.showsScanButton }
        #expect(!form.showsScanButton)
    }

    @Test("authorized camera presents only when a scanner exists")
    func authorizedCameraChecksScanner() async {
        let opened = await ScanPrefillFixture.open()
        defer { opened.loading.cancel() }
        let camera = StubCameraAuthorization(standing: .authorized)

        #expect(await opened.form.canPresentScanner(camera: camera) { true })
        #expect(!(await opened.form.canPresentScanner(camera: camera) { false }))
        #expect(opened.form.prefillStatus == .scannerUnavailable)
    }

    @Test("granting the camera prompt permits scanning")
    func grantsCameraPrompt() async {
        let opened = await ScanPrefillFixture.open()
        defer { opened.loading.cancel() }
        let camera = StubCameraAuthorization(standing: .notDetermined, afterPrompt: .authorized)

        #expect(await opened.form.canPresentScanner(camera: camera) { true })
        #expect(opened.form.prefillStatus == nil)
    }

    @Test(
        "camera refusals map to the approved status",
        arguments: [CameraAccess.denied, .restricted, .notDetermined, .unavailable])
    func cameraRefusal(access: CameraAccess) async {
        let opened = await ScanPrefillFixture.open()
        defer { opened.loading.cancel() }

        let presented = await opened.form.canPresentScanner(
            camera: StubCameraAuthorization(standing: access), isScannerAvailable: { true })

        #expect(!presented)
        #expect(
            opened.form.prefillStatus
                == (access == .unavailable ? .scannerUnavailable : .cameraDenied))
    }
}

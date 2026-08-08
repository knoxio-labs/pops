import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePairing

/// The camera half of the screen: whether the scanner opens, what happens when
/// it may not, and what a scan does to the form.
@MainActor
@Suite("PairingViewModel — scanning")
internal struct PairingScannerFlowTests {
    private func model(
        camera: StubCameraAuthorization,
        pairing: FakeDevicePairingService = FakeDevicePairingService()
    ) -> PairingViewModel {
        PairingViewModel(
            session: SessionStore(),
            dependencies: .fake(pairing: pairing),
            camera: camera,
            device: StubDeviceDescription()
        )
    }

    @Test("granting access opens the scanner")
    func authorizedOpensTheScanner() async {
        let camera = StubCameraAuthorization(standing: .notDetermined, afterPrompt: .authorized)
        let model = model(camera: camera)

        await model.scanQRCode()

        #expect(model.cameraAccess == .authorized)
        #expect(model.isScannerPresented)
        #expect(camera.promptCount == 1)
    }

    /// The acceptance criterion: a refusal is a state, not a crash and not a
    /// dead end. The scanner stays shut, the screen records why, and the form
    /// underneath — which was always there — is the path forward.
    @Test(
        "a refusal leaves the scanner shut and the manual path open",
        arguments: [CameraAccess.denied, .restricted, .unavailable])
    func refusalKeepsTheManualPath(refusal: CameraAccess) async {
        let camera = StubCameraAuthorization(standing: .notDetermined, afterPrompt: refusal)
        let model = model(camera: camera)

        await model.scanQRCode()

        #expect(model.cameraAccess == refusal)
        #expect(!model.isScannerPresented)

        // Typing still pairs. This is the whole point of the fallback: the
        // camera path fails in exactly the situations where re-pairing matters.
        model.baseURLText = "https://bfm.example.com"
        model.codeText = "7QK4-9M2X-P3ND"
        #expect(model.canSubmit)
    }

    @Test("the standing decision is read without prompting")
    func refreshDoesNotPrompt() {
        let camera = StubCameraAuthorization(standing: .denied)
        let model = model(camera: camera)

        model.refreshCameraAccess()

        #expect(model.cameraAccess == .denied)
        #expect(camera.promptCount == 0)
    }

    /// Someone who allowed the camera in Settings comes back to a screen that
    /// has not been re-created. Without a re-read it keeps claiming it cannot
    /// use the camera until the app is relaunched.
    @Test("a decision changed outside the app is picked up on the next read")
    func accessChangedInSettingsIsPickedUp() {
        let camera = StubCameraAuthorization(standing: .denied)
        let model = model(camera: camera)
        model.refreshCameraAccess()

        camera.standing = .authorized
        model.refreshCameraAccess()

        #expect(model.cameraAccess == .authorized)
    }

    @Test("a scanned pairing link fills the form and closes the scanner")
    func scanFillsTheForm() async {
        let camera = StubCameraAuthorization(standing: .authorized)
        let model = model(camera: camera)
        await model.scanQRCode()

        let consumed = model.didScan("https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND")

        #expect(consumed)
        #expect(model.baseURLText == "https://bfm.example.com")
        #expect(model.codeText == "7QK4-9M2X-P3ND")
        #expect(!model.isScannerPresented)
        // The name came from the device and is not touched by a scan; with it
        // prefilled the whole flow is scan-then-tap, no typing.
        #expect(model.canSubmit)
    }

    @Test("an unrelated QR code is ignored rather than reported")
    func unrelatedCodeKeepsScanning() async {
        let camera = StubCameraAuthorization(standing: .authorized)
        let model = model(camera: camera)
        await model.scanQRCode()

        let consumed = model.didScan("WIFI:S:HomeNetwork;T:WPA;P:hunter2;;")

        #expect(!consumed)
        #expect(model.isScannerPresented)
        #expect(model.baseURLText.isEmpty)
        #expect(model.codeText.isEmpty)
        // Not an error state: the camera sees other codes constantly and every
        // one of them would otherwise paint a failure over the screen.
        #expect(model.failure == nil)
    }

    @Test("a scan clears a failure left by the previous attempt")
    func scanClearsTheFailure() async {
        let pairing = FakeDevicePairingService(result: .failure(.codeRejected))
        let model = model(
            camera: StubCameraAuthorization(standing: .authorized), pairing: pairing)
        model.baseURLText = "https://bfm.example.com"
        model.codeText = "7QK4-9M2X-P3ND"
        await model.pair()
        #expect(model.failure == .codeRejected)

        model.didScan("https://bfm.example.com/devices/pair?code=NEW-CODE")

        #expect(model.failure == nil)
        #expect(model.codeText == "NEW-CODE")
    }
}

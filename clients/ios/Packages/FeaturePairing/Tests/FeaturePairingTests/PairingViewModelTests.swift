import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePairing

/// Every outcome the pairing screen can reach, against fakes.
///
/// What is *not* here: that a failed exchange deletes the Enclave key. That
/// happens inside the `DevicePairingService`, which this screen only knows as a
/// protocol, and it is asserted where it lives — `BFMDevicePairingServiceTests`
/// in `Auth`. Duplicating it here would assert the fake.
@MainActor
@Suite("PairingViewModel")
internal struct PairingViewModelTests {
    private struct Fixture {
        let model: PairingViewModel
        let session: SessionStore
        let pairing: FakeDevicePairingService
        let camera: StubCameraAuthorization
    }

    private func fixture(
        result: Result<PairedDevice, PairingError> = .success(.fake()),
        camera: StubCameraAuthorization = StubCameraAuthorization(standing: .authorized),
        device: StubDeviceDescription = StubDeviceDescription(),
        initialBaseURL: URL? = nil
    ) -> Fixture {
        let session = SessionStore()
        let pairing = FakeDevicePairingService(result: result)
        return Fixture(
            model: PairingViewModel(
                session: session,
                dependencies: .fake(pairing: pairing),
                camera: camera,
                device: device,
                initialBaseURL: initialBaseURL
            ),
            session: session,
            pairing: pairing,
            camera: camera
        )
    }

    /// A filled-in form, so the tests about failure are about failure rather
    /// than about validation.
    private func readyToPair(_ model: PairingViewModel) {
        model.baseURLText = "https://bfm.example.com"
        model.codeText = "7QK4-9M2X-P3ND"
    }

    @Test("a fresh screen offers the device's own name and nothing else")
    func startsFromTheDevice() {
        let fixture = fixture(device: StubDeviceDescription(suggestedName: "Joao's iPhone"))

        #expect(fixture.model.deviceNameText == "Joao's iPhone")
        #expect(fixture.model.baseURLText.isEmpty)
        #expect(fixture.model.codeText.isEmpty)
        #expect(!fixture.model.canSubmit)
    }

    /// Debug builds ship a localhost default so simulator work does not have to
    /// pair against a real host first. It arrives as a parameter because the
    /// value lives in `BFMClient`, which a feature may not import.
    @Test("a base URL supplied by the composition root prefills the field")
    func prefillsTheGivenBaseURL() {
        let fixture = fixture(initialBaseURL: URL(string: "http://localhost:3014"))

        #expect(fixture.model.baseURLText == "http://localhost:3014")
    }

    @Test("the happy path commits the session")
    func happyPath() async throws {
        let fixture = fixture(result: .success(.fake(id: "device-7")))
        readyToPair(fixture.model)

        await fixture.model.pair()

        #expect(fixture.session.state == .paired(.fake(id: "device-7")))
        #expect(fixture.model.failure == nil)
        #expect(!fixture.model.isPairing)
    }

    @Test("what the service is sent is what the form holds")
    func sendsTheFormsContents() async throws {
        let fixture = fixture(device: StubDeviceDescription(modelIdentifier: "iPhone17,1"))
        readyToPair(fixture.model)
        fixture.model.deviceNameText = "  Joao's iPhone  "

        await fixture.model.pair()

        let request = try #require(await fixture.pairing.requests.first)
        #expect(request.baseURL.absoluteString == "https://bfm.example.com")
        #expect(request.code == "7QK4-9M2X-P3ND")
        // Trimmed, because a trailing space is not part of anyone's intent and
        // the contract trims it server-side anyway.
        #expect(request.deviceName == "Joao's iPhone")
        #expect(request.deviceModel == "iPhone17,1")
    }

    @Test(
        "every failure is surfaced as itself, and the session does not move",
        arguments: [
            PairingError.codeRejected,
            .rateLimited(retryAfterSeconds: 30),
            .rateLimited(retryAfterSeconds: nil),
            .invalidRequest,
            .unreachable,
            .keyGenerationFailed,
            .credentialStorageFailed,
            .dependencyNotBound,
        ])
    func failureIsSurfaced(error: PairingError) async throws {
        let fixture = fixture(result: .failure(error))
        readyToPair(fixture.model)

        await fixture.model.pair()

        #expect(fixture.model.failure == error)
        #expect(fixture.session.state == .unpaired)
        #expect(!fixture.model.isPairing)
    }

    /// A rejected code is spent, unknown or expired — retrying it cannot work,
    /// and a field still holding it invites exactly that.
    @Test("a rejected code is cleared; every other failure leaves the field alone")
    func onlyARejectedCodeIsCleared() async throws {
        let rejected = fixture(result: .failure(.codeRejected))
        readyToPair(rejected.model)
        await rejected.model.pair()
        #expect(rejected.model.codeText.isEmpty)

        let offline = fixture(result: .failure(.unreachable))
        readyToPair(offline.model)
        await offline.model.pair()
        #expect(offline.model.codeText == "7QK4-9M2X-P3ND")
    }

    @Test("a retry clears the previous failure before it starts")
    func retryClearsTheFailure() async throws {
        let fixture = fixture(result: .failure(.unreachable))
        readyToPair(fixture.model)
        await fixture.model.pair()
        #expect(fixture.model.failure == .unreachable)

        await fixture.pairing.setResult(.success(.fake()))
        await fixture.model.pair()

        #expect(fixture.model.failure == nil)
        #expect(fixture.session.state == .paired(.fake()))
    }
}
